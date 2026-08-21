package com.evidencepilot.service.impl;

import com.evidencepilot.dto.QdrantSearchResult;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class QdrantClientImplTest {

    @Test
    void findClosestChunksUsesNamedDenseQueryAndDocumentFilter() throws Exception {
        AtomicReference<String> queryBody = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/collections/source_chunks", exchange -> {
            String path = exchange.getRequestURI().getPath();
            if ("GET".equals(exchange.getRequestMethod()) && "/collections/source_chunks".equals(path)) {
                send(exchange, 200, "{}");
                return;
            }
            if ("POST".equals(exchange.getRequestMethod())
                    && "/collections/source_chunks/points/query".equals(path)) {
                queryBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                send(exchange, 200, """
                        {"result":{"points":[{"id":"11111111-1111-1111-1111-111111111111","score":0.73}]}}
                        """);
                return;
            }
            send(exchange, 404, "{}");
        });
        server.start();
        try {
            QdrantClientImpl client = new QdrantClientImpl(
                    "http://localhost:" + server.getAddress().getPort(),
                    "");

            List<QdrantSearchResult> results = client.findClosestChunks(
                    List.of(0.25f, -0.5f), List.of("doc-1", "doc-2"), 5);

            assertThat(results)
                    .singleElement()
                    .satisfies(result -> {
                        assertThat(result.chunkId()).isEqualTo("11111111-1111-1111-1111-111111111111");
                        assertThat(result.score()).isEqualByComparingTo("0.73");
                    });
            assertThat(queryBody.get()).contains(
                    "\"using\":\"dense\"",
                    "\"document_id\"",
                    "\"any\":[\"doc-1\",\"doc-2\"]");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void deleteByDocumentIdUsesFilterAndWaitsForCompletion() throws Exception {
        AtomicReference<String> deleteBody = new AtomicReference<>();
        AtomicReference<String> query = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/collections/source_chunks/points/delete", exchange -> {
            query.set(exchange.getRequestURI().getQuery());
            deleteBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            send(exchange, 200, "{\"status\":\"ok\"}");
        });
        server.start();
        try {
            QdrantClientImpl client = new QdrantClientImpl(
                    "http://localhost:" + server.getAddress().getPort(), "");

            client.deleteByDocumentId("doc-1");

            assertThat(query.get()).isEqualTo("wait=true");
            assertThat(deleteBody.get()).contains(
                    "\"document_id\"", "\"value\":\"doc-1\"");
        } finally {
            server.stop(0);
        }
    }

    private static void send(com.sun.net.httpserver.HttpExchange exchange, int status, String body)
            throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
