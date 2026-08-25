package com.evidencepilot.service.impl;

import com.evidencepilot.client.ai.gate.AiModelCallGate;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.ExtractionBundle;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
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
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Component
public class AiModelClientImpl implements AiModelClient {

    private static final MediaType APPLICATION_ZIP = MediaType.valueOf("application/zip");
    private static final Set<Integer> RETRYABLE_STATUSES = Set.of(429, 502, 503, 504);
    private static final long BASE_RETRY_DELAY_MS = 2_000;
    private static final long MAX_RETRY_DELAY_MS = 30_000;
    // Some provider throttle windows are minute-scale; a shorter 429 backoff can
    // retry inside the same window and fail every time.
    private static final long RATE_LIMIT_FLOOR_MS = 60_000;

    private final RestClient restClient;
    private final RestClient reviewRestClient;
    private final String baseUrl;
    private final ObjectMapper objectMapper;
    private final int maxRetries;
    private final AiModelCallGate aiModelCallGate;

    @Autowired
    public AiModelClientImpl(@Qualifier("aiRestClient") RestClient restClient,
            @Qualifier("aiReviewRestClient") RestClient reviewRestClient,
            @Qualifier("aiModelBaseUrl") String baseUrl,
            ObjectMapper objectMapper,
            @Value("${ai.model.max-retries:3}") int maxRetries,
            AiModelCallGate aiModelCallGate) {
        this.restClient = restClient;
        this.reviewRestClient = reviewRestClient;
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
        return generate(restClient, maxRetries, system, prompt);
    }

    @Override
    public GenerationResult generateForReview(String system, String prompt) {
        return generate(reviewRestClient, 1, system, prompt);
    }

    private GenerationResult generate(
            RestClient client, int retryLimit, String system, String prompt) {
        Map<String, Object> response = call("/ai/generate", retryLimit, () -> client.post()
                .uri(baseUrl + "/ai/generate")
                .body(Map.of(
                        "system", system == null ? "" : system,
                        "prompt", prompt))
                .retrieve()
                .body(Map.class));
        if (response == null
                || !hasText(response.get("provider"))
                || !hasText(response.get("model"))
                || !hasText(response.get("response"))) {
            throw new AiApiException("/ai/generate", "returned null or empty response", null);
        }
        return new GenerationResult(
                String.valueOf(response.get("provider")),
                String.valueOf(response.get("model")),
                String.valueOf(response.get("response")));
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
                if (!RETRYABLE_STATUSES.contains(status) || attempt >= retryLimit) {
                    aiModelCallGate.recordFinalOutcome(
                            endpoint, status >= 500 && status <= 599);
                    log.warn("ai_call endpoint={} outcome=http_error status={} attempts={} duration_ms={}",
                            endpoint, status, attempt + 1, elapsedMillis(startedNanos));
                    throw new AiApiException(endpoint, status);
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
                if (attempt >= retryLimit) {
                    aiModelCallGate.recordFinalOutcome(endpoint, true);
                    log.warn("ai_call endpoint={} outcome=transport_error status=503 attempts={} duration_ms={} error_type={}",
                            endpoint, attempt + 1, elapsedMillis(startedNanos), e.getClass().getSimpleName());
                    throw new AiApiException(endpoint, 503, "AI model offline", e);
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

    private static boolean hasText(Object value) {
        return value != null && !String.valueOf(value).isBlank();
    }

    @FunctionalInterface
    private interface AiCall<T> {
        T execute();
    }
}
