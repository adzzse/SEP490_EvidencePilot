package com.evidencepilot.service.impl;

import com.evidencepilot.client.ai.gate.AiModelCallGate;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.ExtractionBundle;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.SocketTimeoutException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;

@Slf4j
@Component
public class AiModelClientImpl implements AiModelClient {

    private static final MediaType APPLICATION_ZIP = MediaType.valueOf("application/zip");
    private static final Set<Integer> RETRYABLE_STATUSES = Set.of(429, 502, 503, 504);
    private static final String MODEL_UNAVAILABLE_DETAIL = "Generation model is currently unavailable";
    private static final String PROVIDER_REJECTED_DETAIL = "Generation provider rejected the request";
    private static final Set<String> NON_RETRYABLE_UPSTREAM_DETAILS = Set.of(
            MODEL_UNAVAILABLE_DETAIL,
            PROVIDER_REJECTED_DETAIL);
    private static final Set<String> PUBLIC_UPSTREAM_DETAILS = Set.of(
            MODEL_UNAVAILABLE_DETAIL,
            "Generation provider is temporarily overloaded",
            "Generation provider is temporarily unavailable",
            "Generation provider could not be reached",
            "Generation provider returned an unexpected status",
            PROVIDER_REJECTED_DETAIL,
            "Provider rate limit exceeded",
            "Provider returned an invalid generation response");
    private static final long BASE_RETRY_DELAY_MS = 2_000;
    private static final long MAX_RETRY_DELAY_MS = 30_000;
    // Some provider throttle windows are minute-scale; a shorter 429 backoff can
    // retry inside the same window and fail every time.
    private static final long RATE_LIMIT_FLOOR_MS = 60_000;
    private static final String GENERATION_ENDPOINT = "/ai/generate";
    private static final Set<String> GENERATION_ERROR_CODES = Set.of(
            "INVALID_GENERATION_REQUEST", "GENERATION_CONFIGURATION_ERROR", "GENERATION_UNAVAILABLE",
            "GENERATION_DEADLINE_EXCEEDED", "GENERATION_RATE_LIMITED", "GENERATION_QUOTA_EXCEEDED",
            "GENERATION_REQUEST_REJECTED", "GENERATION_REFUSED", "INVALID_GENERATION_RESPONSE",
            "GENERATION_INCOMPLETE");

    private final RestClient restClient;
    private final OkHttpClient generationClient;
    private final String apiKey;
    private final String baseUrl;
    private final ObjectMapper objectMapper;
    private final int maxRetries;
    private final AiModelCallGate aiModelCallGate;

    @Autowired
    public AiModelClientImpl(@Qualifier("aiRestClient") RestClient restClient,
            @Qualifier("aiGenerationClient") OkHttpClient generationClient,
            @Qualifier("aiModelBaseUrl") String baseUrl,
            ObjectMapper objectMapper,
            @Value("${ai.model.max-retries:3}") int maxRetries,
            AiModelCallGate aiModelCallGate,
            @Value("${ai.model.api-key:}") String apiKey) {
        this.restClient = restClient;
        this.generationClient = generationClient;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl == null || baseUrl.isBlank() ? "" : trimTrailingSlash(baseUrl);
        this.objectMapper = objectMapper;
        this.maxRetries = Math.max(0, maxRetries);
        this.aiModelCallGate = aiModelCallGate;
    }

    @SuppressWarnings("unchecked")
    @Override
    public Map<String, Object> health() {
        return call("/health", 0, () -> restClient.get()
                .uri(baseUrl + "/health")
                .retrieve()
                .body(Map.class));
    }

    @Override
    public GenerationResult generate(String system, String prompt) {
        return generateValidated(system, prompt, null, Function.identity());
    }

    @Override
    public GenerationResult generateForReview(String system, String prompt) {
        return generate(system, prompt);
    }

    @Override
    public GenerationResult generateStrict(String system, String prompt, Map<String, Object> jsonSchema) {
        return generateValidated(system, prompt, jsonSchema, Function.identity());
    }

    @Override
    public <T> T generateValidated(String system, String prompt, Map<String, Object> jsonSchema,
            Function<GenerationResult, T> validator) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(300);
        if (baseUrl.isBlank()) {
            throw generationFailure(503, "GENERATION_CONFIGURATION_ERROR", null);
        }
        aiModelCallGate.checkCircuit(GENERATION_ENDPOINT);
        return aiModelCallGate.execute(GENERATION_ENDPOINT, deadline, () -> {
            try {
                T result = generate(system, prompt, jsonSchema, validator, deadline);
                aiModelCallGate.recordFinalOutcome(GENERATION_ENDPOINT, false);
                return result;
            } catch (RuntimeException exception) {
                aiModelCallGate.recordFinalOutcome(GENERATION_ENDPOINT,
                        !(exception instanceof AiApiException api) || api.getStatusCode() >= 500);
                throw exception;
            }
        });
    }

    private <T> T generate(String system, String prompt, Map<String, Object> jsonSchema,
            Function<GenerationResult, T> validator, long deadline) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("system", system == null ? "" : system);
        body.put("prompt", prompt);
        if (jsonSchema != null && !jsonSchema.isEmpty()) {
            body.put("response_format", Map.of(
                    "type", "json_schema",
                    "json_schema", Map.of("name", "generation_result", "strict", true, "schema", jsonSchema)));
        }
        int modelIndex = 0;
        int attempt = 1;
        while (true) {
            body.put("model_index", modelIndex);
            body.put("attempt", attempt);
            // Reserve transport and final validation time inside the same batch deadline.
            long budgetMillis = remainingMillis(deadline) - 1_000;
            if (budgetMillis <= 0) throw generationFailure(503, "GENERATION_DEADLINE_EXCEEDED", null);
            body.put("budget_ms", budgetMillis);
            GenerationResult generation = requestGeneration(body, deadline);
            if (generation.modelIndex() < modelIndex
                    || generation.modelIndex() == modelIndex && generation.attempt() < attempt) {
                throw generationFailure(502, "INVALID_GENERATION_RESPONSE", null);
            }
            remainingMillis(deadline);
            T result;
            try {
                result = validator.apply(generation);
            } catch (IllegalArgumentException invalid) {
                if (generation.attempt() == 1) {
                    modelIndex = generation.modelIndex();
                    attempt = 2;
                } else if (generation.nextModelIndex() != null) {
                    modelIndex = generation.nextModelIndex();
                    attempt = 1;
                } else {
                    throw generationFailure(502, "INVALID_GENERATION_RESPONSE", null);
                }
                // Never send raw model output or exception text back as instructions.
                body.put("validation_feedback", "BUSINESS_VALIDATION_FAILED: obey the output contract, "
                        + "return every required ID exactly once, and use only exact quotes from the supplied text.");
                continue;
            }
            remainingMillis(deadline);
            return result;
        }
    }

    private GenerationResult requestGeneration(Map<String, Object> body, long deadline) {
        Request request;
        try {
            byte[] payload = objectMapper.writeValueAsBytes(body);
            Request.Builder builder = new Request.Builder().url(baseUrl + GENERATION_ENDPOINT)
                    .header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                    .header("ngrok-skip-browser-warning", "true")
                    .post(new RequestBody() {
                        @Override public okhttp3.MediaType contentType() {
                            return okhttp3.MediaType.get(MediaType.APPLICATION_JSON_VALUE);
                        }
                        @Override public long contentLength() { return payload.length; }
                        // Also prevents implicit 408/503 retries after the body was sent.
                        @Override public boolean isOneShot() { return true; }
                        @Override public void writeTo(okio.BufferedSink sink) throws IOException { sink.write(payload); }
                    });
            if (apiKey != null && !apiKey.isBlank()) builder.header("X-API-Key", apiKey);
            request = builder.build();
        } catch (IOException | IllegalArgumentException exception) {
            throw generationFailure(422, "INVALID_GENERATION_REQUEST", null);
        }
        var call = generationClient.newCall(request);
        call.timeout().timeout(remainingMillis(deadline), TimeUnit.MILLISECONDS);
        try (Response response = call.execute()) {
            byte[] responseBody = response.body() == null ? new byte[0] : response.body().bytes();
            if (!response.isSuccessful()) {
                String code = "GENERATION_UNAVAILABLE";
                try {
                    JsonNode error = objectMapper.readTree(responseBody);
                    String upstream = error == null ? "" : error.path("code").asText();
                    if (GENERATION_ERROR_CODES.contains(upstream)) code = upstream;
                } catch (IOException ignored) {
                }
                String retryHeader = response.header("Retry-After");
                Long retryAfter = retryHeader == null ? null : parseRetryAfter(retryHeader);
                throw new AiApiException(GENERATION_ENDPOINT, response.code(), code,
                        code, retryAfter, null);
            }
            JsonNode value = objectMapper.readTree(responseBody);
            if (value == null || !value.isObject() || !value.path("done").isBoolean()
                    || !value.path("done").booleanValue()
                    || !jsonText(value.get("provider")) || !jsonText(value.get("model"))
                    || !jsonText(value.get("response"))
                    || !index(value.get("model_index"))
                    || !value.path("attempt").isInt() || value.path("attempt").asInt() < 1
                    || value.path("attempt").asInt() > 2 || !value.has("next_model_index")) {
                throw generationFailure(502, "INVALID_GENERATION_RESPONSE", null);
            }
            JsonNode next = value.get("next_model_index");
            if (!next.isNull() && (!index(next) || next.intValue() != value.path("model_index").intValue() + 1)) {
                throw generationFailure(502, "INVALID_GENERATION_RESPONSE", null);
            }
            return new GenerationResult(value.get("provider").textValue(), value.get("model").textValue(),
                    value.get("response").textValue(), true, value.get("model_index").intValue(),
                    value.get("attempt").intValue(), next.isNull() ? null : next.intValue());
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw generationFailure(502, "INVALID_GENERATION_RESPONSE", null);
        } catch (IOException exception) {
            throw generationFailure(503, System.nanoTime() >= deadline
                    || call.isCanceled() && exception instanceof java.io.InterruptedIOException
                    ? "GENERATION_DEADLINE_EXCEEDED" : "GENERATION_UNAVAILABLE", null);
        } finally {
            call.cancel();
        }
    }

    private static boolean jsonText(JsonNode value) {
        return value != null && value.isTextual() && !value.textValue().isBlank();
    }

    private static boolean index(JsonNode value) {
        return value != null && value.isInt() && value.intValue() >= 0 && value.intValue() <= 2;
    }

    private static long remainingMillis(long deadline) {
        long remaining = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
        if (remaining <= 0) throw generationFailure(503, "GENERATION_DEADLINE_EXCEEDED", null);
        return remaining;
    }

    private static AiApiException generationFailure(int status, String code, Throwable cause) {
        return new AiApiException(GENERATION_ENDPOINT, status, code, code, null, cause);
    }

    private static Long parseRetryAfter(String value) {
        try {
            return Math.multiplyExact(Math.max(0, Long.parseLong(value.strip())), 1_000);
        } catch (NumberFormatException exception) {
            try {
                return Math.max(0, Duration.between(java.time.Instant.now(),
                        ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()).toMillis());
            } catch (DateTimeParseException ignored) {
                return null;
            }
        } catch (ArithmeticException exception) {
            return null;
        }
    }

    @Override
    public ExtractionBundle extractDocument(String filename, String downloadUrl) {
        Path archivePath;
        try {
            archivePath = Files.createTempFile("evidencepilot-extraction-", ".zip");
        } catch (IOException e) {
            throw new AiApiException("/extract", "could not create temporary archive", e);
        }

        boolean returned = false;
        try {
            ExtractionBundle bundle = call("/extract", () -> restClient.post()
                    .uri(baseUrl + "/extract")
                    .accept(APPLICATION_ZIP)
                    .body(Map.of(
                            "filename", stringValue(filename, "document"),
                            "download_url", downloadUrl))
                    .exchange((request, response) -> {
                        if (!response.getStatusCode().is2xxSuccessful()) {
                            throw new AiApiException("/extract", response.getStatusCode().value());
                        }
                        if (!APPLICATION_ZIP.equalsTypeAndSubtype(response.getHeaders().getContentType())) {
                            throw new AiApiException("/extract", "did not return application/zip", null);
                        }
                        try (InputStream input = response.getBody();
                                OutputStream output = Files.newOutputStream(archivePath)) {
                            if (input == null) {
                                throw new IOException("Extraction bundle response body is empty");
                            }
                            copyWithLimit(input, output, 100L * 1024 * 1024);
                        } catch (IOException e) {
                            throw new AiApiException("/extract", "could not download extraction bundle", e);
                        }
                        try {
                            return ExtractionBundle.open(archivePath);
                        } catch (IOException e) {
                            throw new AiApiException("/extract", "returned an invalid extraction bundle", e);
                        }
                    }));
            returned = true;
            return bundle;
        } finally {
            if (!returned) {
                try {
                    Files.deleteIfExists(archivePath);
                } catch (IOException ignored) {
                }
            }
        }
    }

    public static void copyWithLimit(InputStream input, OutputStream output, long maxBytes) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        int read;
        while ((read = input.read(buffer)) >= 0) {
            total += read;
            if (total > maxBytes) {
                throw new IOException("Extraction bundle exceeds the 100 MiB limit");
            }
            output.write(buffer, 0, read);
        }
    }

    @Override
    public List<Float> generateEmbedding(String text) {
        Map<String, Object> response = call("/ai/embeddings", () -> restClient.post()
                .uri(baseUrl + "/ai/embeddings")
                .body(Map.of("text", text))
                .retrieve()
                .body(Map.class));
        if (response == null || !response.containsKey("embedding")) {
            throw new AiApiException("/ai/embeddings", "returned null or empty embedding", null);
        }
        return floatVector(response.get("embedding"), "/ai/embeddings");
    }

    @Override
    public List<List<Float>> generateEmbeddings(List<String> texts) {
        Map<String, Object> response = call("/ai/embeddings/batch", () -> restClient.post()
                .uri(baseUrl + "/ai/embeddings/batch")
                .body(Map.of("texts", texts))
                .retrieve()
                .body(Map.class));
        if (response == null || !(response.get("embeddings") instanceof List<?> raw)
                || raw.size() != texts.size()) {
            throw new AiApiException("/ai/embeddings/batch", "returned an invalid embedding count", null);
        }
        return raw.stream()
                .map(vector -> floatVector(vector, "/ai/embeddings/batch"))
                .toList();
    }

    private <T> T call(String endpoint, AiCall<T> call) {
        return call(endpoint, maxRetries, call);
    }

    private <T> T call(String endpoint, int retryLimit, AiCall<T> call) {
        if (baseUrl.isBlank()) {
            throw new AiApiException(endpoint, 503, "AI_MODEL_BASE_URL is not configured", null);
        }
        aiModelCallGate.checkCircuit(endpoint);
        long startedNanos = System.nanoTime();
        int attempt = 0;
        AtomicBoolean attempted = new AtomicBoolean();
        while (true) {
            attempted.set(false);
            try {
                T result = aiModelCallGate.execute(endpoint, () -> {
                    attempted.set(true);
                    return call.execute();
                });
                aiModelCallGate.recordFinalOutcome(endpoint, false);
                log.info("ai_call endpoint={} outcome=success status=200 attempts={} duration_ms={}",
                        endpoint, attempt + 1, elapsedMillis(startedNanos));
                return result;
            } catch (AiApiException e) {
                if (attempted.get()) {
                    aiModelCallGate.recordFinalOutcome(
                            endpoint, e.getStatusCode() >= 500 && e.getStatusCode() <= 599);
                }
                log.warn("ai_call endpoint={} outcome=api_error status={} attempts={} duration_ms={}",
                        endpoint, e.getStatusCode(), attempt + 1, elapsedMillis(startedNanos));
                throw e;
            } catch (RestClientResponseException e) {
                int status = e.getStatusCode().value();
                String publicDetail = publicUpstreamDetail(e);
                boolean retryable = RETRYABLE_STATUSES.contains(status)
                        && (publicDetail == null
                            || !NON_RETRYABLE_UPSTREAM_DETAILS.contains(publicDetail));
                if (!retryable || attempt >= retryLimit) {
                    aiModelCallGate.recordFinalOutcome(
                            endpoint, status >= 500 && status <= 599);
                    log.warn("ai_call endpoint={} outcome=http_error status={} attempts={} duration_ms={}",
                            endpoint, status, attempt + 1, elapsedMillis(startedNanos));
                    throw new AiApiException(endpoint, status, publicDetail, e);
                }
                long retryAfterMillis = retryAfterMillis(e);
                attempt++;
                long backoffMillis = retryAfterMillis >= 0
                        ? retryAfterMillis
                        : status == 429
                            ? Math.max(RATE_LIMIT_FLOOR_MS,
                                    Math.min(BASE_RETRY_DELAY_MS * (1L << (attempt - 1)), MAX_RETRY_DELAY_MS))
                            : Math.min(BASE_RETRY_DELAY_MS * (1L << (attempt - 1)), MAX_RETRY_DELAY_MS);
                log.warn("ai_call_retry endpoint={} failure=http status={} retry={}/{} delay_ms={}",
                        endpoint, status, attempt, retryLimit, backoffMillis);
                sleep(backoffMillis);
            } catch (RestClientException e) {
                boolean timedOut = causedBySocketTimeout(e);
                if (timedOut || attempt >= retryLimit) {
                    aiModelCallGate.recordFinalOutcome(endpoint, true);
                    log.warn("ai_call endpoint={} outcome=transport_error status=503 attempts={} duration_ms={} error_type={}",
                            endpoint, attempt + 1, elapsedMillis(startedNanos), e.getClass().getSimpleName());
                    throw new AiApiException(
                            endpoint,
                            503,
                            timedOut ? "AI model request timed out" : "AI model offline",
                            e);
                }
                attempt++;
                long backoffMillis = Math.min(
                        BASE_RETRY_DELAY_MS * (1L << (attempt - 1)), MAX_RETRY_DELAY_MS);
                log.warn("ai_call_retry endpoint={} failure=transport status=503 retry={}/{} delay_ms={} error_type={}",
                        endpoint, attempt, retryLimit, backoffMillis, e.getClass().getSimpleName());
                sleep(backoffMillis);
            }
        }
    }

    private String publicUpstreamDetail(RestClientResponseException exception) {
        try {
            Map<?, ?> body = objectMapper.readValue(
                    exception.getResponseBodyAsByteArray(), Map.class);
            Object detail = body == null ? null : body.get("detail");
            if (detail instanceof String message) {
                String normalized = message.strip();
                return PUBLIC_UPSTREAM_DETAILS.contains(normalized) ? normalized : null;
            }
        } catch (IOException ignored) {
        }
        return null;
    }

    private static boolean causedBySocketTimeout(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SocketTimeoutException) {
                return true;
            }
        }
        return false;
    }

    private static long elapsedMillis(long startedNanos) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedNanos);
    }

    private static long retryAfterMillis(RestClientResponseException e) {
        List<String> values = e.getResponseHeaders() == null ? null
                : e.getResponseHeaders().get(HttpHeaders.RETRY_AFTER);
        if (values == null || values.isEmpty()) {
            return -1;
        }
        try {
            return Long.parseLong(values.get(0).trim()) * 1000;
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static String trimTrailingSlash(String baseUrl) {
        String normalized = baseUrl.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private static List<Float> floatVector(Object raw, String endpoint) {
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            throw new AiApiException(endpoint, "returned an empty embedding", null);
        }
        try {
            return list.stream()
                    .map(value -> ((Number) value).floatValue())
                    .toList();
        } catch (ClassCastException e) {
            throw new AiApiException(endpoint, "returned a non-numeric embedding", e);
        }
    }

    private static String stringValue(Object value, String fallback) {
        if (value == null) {
            return fallback;
        }
        return String.valueOf(value);
    }

    @FunctionalInterface
    private interface AiCall<T> {
        T execute();
    }
}
