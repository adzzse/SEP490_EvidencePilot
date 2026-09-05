package com.evidencepilot.service;

import com.evidencepilot.client.ai.gate.AiModelCallGate;
import com.evidencepilot.client.ai.gate.AiModelCallPolicy;
import com.evidencepilot.service.impl.AiModelClientImpl;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AiGenerationClientTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final List<JsonNode> requests = java.util.Collections.synchronizedList(new ArrayList<>());
    private final AiModelCallPolicy policy = mock(AiModelCallPolicy.class);
    private final java.util.concurrent.ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private HttpServer server;
    private AiModelClientImpl client;
    private volatile Function<JsonNode, String> response;
    private volatile int status = 200;

    @BeforeEach
    void start() throws Exception {
        when(policy.tryAcquireLease(anyInt(), anyLong())).thenReturn("lease");
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(executor);
        server.createContext("/ai/generate", exchange -> {
            JsonNode request = mapper.readTree(exchange.getRequestBody());
            requests.add(request);
            assertThat(exchange.getRequestHeaders().getFirst("X-API-Key")).isEqualTo("test-key");
            byte[] body = response.apply(request).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.getResponseHeaders().set("Retry-After", "7");
            exchange.sendResponseHeaders(status, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        client = new AiModelClientImpl(RestClient.create(), new com.evidencepilot.client.ai.config.AiClientConfig().aiGenerationClient(),
                "http://127.0.0.1:" + server.getAddress().getPort(), mapper, 3,
                new AiModelCallGate(new Semaphore(4), policy), "test-key");
    }

    @AfterEach
    void stop() {
        if (server != null) server.stop(0);
        executor.shutdownNow();
    }

    private String output(int model, int attempt, Integer next, String text) {
        try {
            var body = mapper.createObjectNode().put("provider", "remote").put("model", "model-" + model)
                    .put("response", text).put("done", true).put("model_index", model).put("attempt", attempt);
            if (next == null) body.putNull("next_model_index"); else body.put("next_model_index", next);
            return mapper.writeValueAsString(body);
        } catch (Exception exception) { throw new AssertionError(exception); }
    }

    @ParameterizedTest
    @CsvSource({"1,0,2", "2,1,1"})
    void domainRepairContinuesFromPythonsActualAttempt(int returnedAttempt, int nextModel, int nextAttempt) {
        response = request -> requests.size() == 1
                ? output(0, returnedAttempt, 1, "invalid") : output(nextModel, nextAttempt, nextModel < 2 ? nextModel + 1 : null, "valid");
        String result = client.generateValidated("system", "prompt", Map.of("type", "object"), generated -> {
            if (generated.response().equals("invalid")) throw new IllegalArgumentException("private output");
            return generated.response();
        });
        assertThat(result).isEqualTo("valid");
        assertThat(requests).hasSize(2);
        assertThat(requests.get(1).path("model_index").asInt()).isEqualTo(nextModel);
        assertThat(requests.get(1).path("attempt").asInt()).isEqualTo(nextAttempt);
        assertThat(requests.get(1).path("budget_ms").asLong()).isLessThan(requests.get(0).path("budget_ms").asLong());
        assertThat(requests.get(1).path("validation_feedback").asText()).doesNotContain("private output");
        assertThat(requests.get(1).path("prompt").asText()).isEqualTo("prompt");
        assertThat(requests.get(1).at("/response_format/json_schema/schema/type").asText()).isEqualTo("object");
        verify(policy).recordFinalOutcome(false);
        verify(policy, never()).recordFinalOutcome(true);
        verify(policy).releaseLease("lease");
    }

    @Test
    void exhaustionNeverRestartsModelsAndRecordsOneFailure() {
        response = request -> output(request.path("model_index").asInt(), request.path("attempt").asInt(),
                request.path("model_index").asInt() < 2 ? request.path("model_index").asInt() + 1 : null, "invalid");
        assertThatThrownBy(() -> client.generateValidated("system", "prompt", null,
                result -> { throw new IllegalArgumentException("quote mismatch"); }))
                .isInstanceOf(AiModelClient.AiApiException.class).hasMessageContaining("INVALID_GENERATION_RESPONSE");
        assertThat(requests.stream().map(node -> node.path("model_index").asInt())).containsExactly(0, 0, 1, 1, 2, 2);
        assertThat(requests.stream().map(node -> node.path("attempt").asInt())).containsExactly(1, 2, 1, 2, 1, 2);
        verify(policy).recordFinalOutcome(true);
        verify(policy, never()).recordFinalOutcome(false);
    }

    @ParameterizedTest
    @CsvSource({"422,INVALID_GENERATION_REQUEST", "503,GENERATION_CONFIGURATION_ERROR",
            "503,GENERATION_UNAVAILABLE", "503,GENERATION_DEADLINE_EXCEEDED", "429,GENERATION_RATE_LIMITED",
            "429,GENERATION_QUOTA_EXCEEDED", "502,GENERATION_REQUEST_REJECTED", "502,GENERATION_REFUSED",
            "502,INVALID_GENERATION_RESPONSE", "502,GENERATION_INCOMPLETE"})
    void terminalErrorsAreNeverRetried(int httpStatus, String code) {
        status = httpStatus;
        response = request -> "{\"code\":\"" + code + "\",\"detail\":\"private raw provider body\"}";
        var error = catchThrowableOfType(() -> client.generate("system", "prompt"), AiModelClient.AiApiException.class);
        assertThat(error.getStatusCode()).isEqualTo(httpStatus);
        assertThat(error.getCode()).isEqualTo(code);
        assertThat(error.getRetryAfterMillis()).isEqualTo(7_000L);
        assertThat(error).hasMessageNotContaining("private raw provider body");
        assertThat(requests).hasSize(1);
        verify(policy).recordFinalOutcome(httpStatus >= 500);
    }

    @ParameterizedTest
    @ValueSource(strings = {"done", "model_index", "attempt", "next_model_index"})
    void missingMetadataFailsWithoutDomainValidation(String field) {
        response = request -> {
            var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.valueToTree(
                    Map.of("provider", "remote", "model", "model-0", "response", "{}", "done", true,
                            "model_index", 0, "attempt", 1, "next_model_index", 1));
            body.remove(field);
            return body.toString();
        };
        assertThatThrownBy(() -> client.generate("system", "prompt"))
                .hasMessageContaining("INVALID_GENERATION_RESPONSE");
        assertThat(requests).hasSize(1);
    }

    @Test
    void incompleteResponseFailsWithoutDomainValidation() {
        response = request -> output(0, 1, null, "{}").replace("\"done\":true", "\"done\":false");
        assertThatThrownBy(() -> client.generate("system", "prompt"))
                .hasMessageContaining("INVALID_GENERATION_RESPONSE");
        assertThat(requests).hasSize(1);
    }

    @Test
    void disconnectedTransportIsNotRetried() {
        server.removeContext("/ai/generate");
        server.createContext("/ai/generate", exchange -> {
            requests.add(mapper.readTree(exchange.getRequestBody()));
            exchange.close();
        });
        assertThatThrownBy(() -> client.generate("system", "prompt"))
                .hasMessageContaining("GENERATION_UNAVAILABLE");
        assertThat(requests).hasSize(1);
        verify(policy).recordFinalOutcome(true);
    }

    @Test
    void repeatedCursorCannotAddAThirdAttempt() {
        response = request -> output(0, 1, 1, "invalid");
        assertThatThrownBy(() -> client.generateValidated("system", "prompt", null,
                result -> { throw new IllegalArgumentException("wrong quote"); }))
                .hasMessageContaining("INVALID_GENERATION_RESPONSE");
        assertThat(requests).hasSize(2);
    }

    @Test
    void openRemoteCircuitDoesNotBlockLocalCallsOrHealth() {
        when(policy.isCircuitOpen()).thenReturn(true);
        var localSlots = new Semaphore(1);
        var gate = new AiModelCallGate(localSlots, policy);
        assertThatThrownBy(() -> client.generate("system", "prompt")).hasMessageContaining("circuit is open");
        for (String endpoint : List.of("/extract", "/ai/embeddings", "/ai/embeddings/batch")) {
            gate.checkCircuit(endpoint);
            assertThat(gate.execute(endpoint, () -> "local")).isEqualTo("local");
            gate.recordFinalOutcome(endpoint, true);
        }
        localSlots.acquireUninterruptibly();
        assertThat(gate.execute("/health", () -> "healthy")).isEqualTo("healthy");
        verify(policy, never()).recordFinalOutcome(anyBoolean());
        verify(policy, never()).tryAcquireLease(anyInt(), anyLong());
    }

    @Test
    void fullGenerationPoolDoesNotConsumeLocalSlots() {
        var gate = new AiModelCallGate(new Semaphore(1), policy);
        Semaphore remote = (Semaphore) ReflectionTestUtils.getField(gate, "generationLimiter");
        remote.acquireUninterruptibly(4);
        assertThat(gate.execute("/extract", () -> "local")).isEqualTo("local");
        assertThatThrownBy(() -> gate.execute("/ai/generate", System.nanoTime(), () -> "unexpected"))
                .isInstanceOf(AiModelClient.AiApiException.class);
        remote.release(4);
        assertThat(gate.execute("/ai/generate", () -> "released")).isEqualTo("released");
        verify(policy).releaseLease("lease");
    }

    @Test
    void httpDeadlineIncludesReadingTheBody() {
        server.removeContext("/ai/generate");
        server.createContext("/ai/generate", exchange -> {
            exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(200, 0);
            try (var stream = exchange.getResponseBody()) {
                while (true) {
                    stream.write(' ');
                    stream.flush();
                    try { Thread.sleep(20); } catch (InterruptedException interrupted) { return; }
                }
            } catch (java.io.IOException disconnected) { /* Client cancellation closes the response. */ }
        });
        long started = System.nanoTime();
        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(client, "requestGeneration",
                Map.of("system", "test", "prompt", "test"), started + TimeUnit.MILLISECONDS.toNanos(250)))
                .hasMessageContaining("GENERATION_DEADLINE_EXCEEDED");
        assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)).isLessThan(2_000);
    }
}
