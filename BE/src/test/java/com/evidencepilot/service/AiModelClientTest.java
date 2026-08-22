package com.evidencepilot.service;

import com.evidencepilot.client.ai.gate.AiModelCallGate;
import com.evidencepilot.service.impl.AiModelClientImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

class AiModelClientTest {

    private static AiModelClientImpl client(RestClient restClient, String baseUrl) {
        return client(restClient, baseUrl, 3);
    }

    private static AiModelClientImpl client(RestClient restClient, String baseUrl, int maxRetries) {
        return new AiModelClientImpl(restClient, restClient, baseUrl, new ObjectMapper(), maxRetries,
                new AiModelCallGate(new Semaphore(4)));
    }

    @Test
    void healthReturnsWorkerPayload() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/health"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"status\":\"ok\"}", MediaType.APPLICATION_JSON));

        assertThat(client(builder.build(), "http://ai.test/").health())
                .containsEntry("status", "ok");
        server.verify();
    }

    @Test
    void generateSendsSystemAndReturnsProviderMetadata() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"system":"Review section citations","prompt":"Review this"}
                        """, true))
                .andRespond(withSuccess(
                        """
                        {"provider":"gemini","model":"gemini-3.6-flash","response":"Review text","done":true}
                        """,
                        MediaType.APPLICATION_JSON));

        AiModelClientImpl client = client(builder.build(), "http://ai.test");

        AiModelClient.GenerationResult result = client.generate(
                "Review section citations", "Review this");

        assertThat(result.provider()).isEqualTo("gemini");
        assertThat(result.model()).isEqualTo("gemini-3.6-flash");
        assertThat(result.response()).isEqualTo("Review text");
        server.verify();
    }

    @Test
    void generateRetriesTransient429ThenSucceeds() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "0"));
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(
                        "{\"provider\":\"gemini\",\"model\":\"gemini-3.6-flash\",\"response\":\"Retried\",\"done\":true}",
                        MediaType.APPLICATION_JSON));

        AiModelClient.GenerationResult result = client(builder.build(), "http://ai.test", 1)
                .generate("system", "prompt");

        assertThat(result.response()).isEqualTo("Retried");
        server.verify();
    }

    @Test
    void generateGivesUpOnTransientStatusAfterMaxRetries() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "0"));
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "0"));

        AiModelClient.AiApiException error = assertThrows(
                AiModelClient.AiApiException.class,
                () -> client(builder.build(), "http://ai.test", 1)
                        .generate("system", "prompt"));

        assertThat(error.getStatusCode()).isEqualTo(429);
        server.verify();
    }

    @Test
    void healthFailsFastOnTransportFailure() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/health"))
                .andRespond(request -> {
                    throw new IOException("connection reset");
                });

        assertThatThrownBy(() -> client(builder.build(), "http://ai.test", 3).health())
                .isInstanceOf(AiModelClient.AiApiException.class)
                .extracting(error -> ((AiModelClient.AiApiException) error).getStatusCode())
                .isEqualTo(503);
        server.verify();
    }

    @Test
    void generateRetriesTransportFailureThenSucceeds() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andRespond(request -> {
                    throw new IOException("connection reset");
                });
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andRespond(withSuccess(
                        "{\"provider\":\"ollama\",\"model\":\"qwen\",\"response\":\"Retried\",\"done\":true}",
                        MediaType.APPLICATION_JSON));

        AiModelClient.GenerationResult result = client(builder.build(), "http://ai.test", 1)
                .generate("system", "prompt");

        assertThat(result.response()).isEqualTo("Retried");
        server.verify();
    }

    @Test
    void generateForReviewUsesAtMostOneRetry() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "0"));
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "0"));

        AiModelClient.AiApiException error = assertThrows(
                AiModelClient.AiApiException.class,
                () -> client(builder.build(), "http://ai.test", 5)
                        .generateForReview("system", "prompt"));

        assertThat(error.getStatusCode()).isEqualTo(429);
        server.verify();
    }

    @Test
    void generatePreservesUpstreamHttpStatus() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY));

        AiModelClient.AiApiException error = assertThrows(
                AiModelClient.AiApiException.class,
                () -> client(builder.build(), "http://ai.test")
                        .generate("system", "prompt"));

        assertThat(error.getStatusCode()).isEqualTo(422);
        server.verify();
    }

    @Test
    void extractDocumentStreamsExtractionZipAndDeletesItWhenClosed() throws IOException {
        RestClient.Builder builder = RestClient.builder()
                .defaultHeader("ngrok-skip-browser-warning", "true");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/extract"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("ngrok-skip-browser-warning", "true"))
                .andExpect(header("Accept", "application/zip"))
                .andExpect(content().json("""
                        {
                          "filename":"source.pdf",
                          "download_url":"https://storage.test/source.pdf"
                        }
                        """, true))
                .andRespond(withSuccess(extractionZip(), MediaType.valueOf("application/zip")));

        AiModelClientImpl client = client(builder.build(), "http://ai.test");

        ExtractionBundle bundle = client.extractDocument("source.pdf", "https://storage.test/source.pdf");

        assertThat(bundle.document().markdown()).isEqualTo("# Extracted\n\n![](images/figure.jpg)");
        assertThat(bundle.document().blocks()).extracting(AiModelClient.ExtractionBlock::type)
                .containsExactly("heading", "paragraph");
        try (InputStream image = bundle.openImage("images/figure.jpg")) {
            assertThat(image.readAllBytes()).containsExactly(1, 2, 3);
        }
        var archivePath = (java.nio.file.Path) org.springframework.test.util.ReflectionTestUtils
                .getField(bundle, "archivePath");
        assertThat(Files.exists(archivePath)).isTrue();
        bundle.close();
        assertThat(Files.exists(archivePath)).isFalse();
        server.verify();
    }

    @Test
    void extractDocumentRejectsNonZipResponse() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/extract"))
                .andRespond(withSuccess(
                        "{\"filename\":\"source.pdf\",\"method\":\"mineru\",\"markdown\":\"# Extracted\"}",
                        MediaType.APPLICATION_JSON));

        AiModelClientImpl client = client(builder.build(), "http://ai.test");

        assertThatThrownBy(() -> client.extractDocument("source.pdf", "https://storage.test/source.pdf"))
                .isInstanceOf(AiModelClient.AiApiException.class)
                .hasMessageContaining("application/zip");
    }

    @Test
    void generateEmbeddingConvertsNumericArray() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/ai/embeddings"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"embedding\":[0.25,-0.5,1]}", MediaType.APPLICATION_JSON));

        assertThat(client(builder.build(), "http://ai.test").generateEmbedding("text"))
                .containsExactly(0.25f, -0.5f, 1.0f);
        server.verify();
    }

    @Test
    void generateEmbeddingsReturnsBatchInOrder() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/ai/embeddings/batch"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(
                        "{\"embeddings\":[[0.25,-0.5],[1,2]]}",
                        MediaType.APPLICATION_JSON));

        assertThat(client(builder.build(), "http://ai.test")
                .generateEmbeddings(List.of("one", "two")))
                .containsExactly(List.of(0.25f, -0.5f), List.of(1.0f, 2.0f));
        server.verify();
    }

    @Test
    void missingBaseUrlAndEmptyResponsesThrowAiApiException() {
        assertThatThrownBy(() -> client(RestClient.create(), " ").health())
                .isInstanceOf(AiModelClient.AiApiException.class)
                .hasMessageContaining("not configured");

        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://ai.test/ai/generate"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client(builder.build(), "http://ai.test")
                .generate("system", "prompt"))
                .isInstanceOf(AiModelClient.AiApiException.class)
                .hasMessageContaining("empty response");
    }

    private static byte[] extractionZip() throws IOException {
        var output = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
            zip.putNextEntry(new ZipEntry("extraction.json"));
            zip.write("""
                    {"blocks":[
                      {"type":"heading","text":"Extracted","level":1,"caption":null},
                      {"type":"paragraph","text":"Body","level":null,"caption":null}
                    ],"images":["images/figure.jpg"]}
                    """.getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("document.md"));
            zip.write("# Extracted\n\n![](images/figure.jpg)".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("images/figure.jpg"));
            zip.write(new byte[] {1, 2, 3});
            zip.closeEntry();
        }
        return output.toByteArray();
    }
}
