package com.evidencepilot.service.impl;

import com.evidencepilot.dto.NamedVectors;
import com.evidencepilot.dto.QdrantSearchResult;
import com.evidencepilot.dto.SparseVector;
import com.evidencepilot.dto.UpsertBody;
import com.evidencepilot.dto.UpsertPoint;
import com.evidencepilot.exception.QdrantException;
import com.evidencepilot.service.QdrantClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class QdrantClientImpl implements QdrantClient {

    private static final String COLLECTION = "source_chunks";

    private final RestClient restClient;
    private final String baseUrl;

    private volatile boolean collectionEnsured = false;

    public QdrantClientImpl(
            @Value("${qdrant.url}") String qdrantUrl,
            @Value("${qdrant.api-key}") String qdrantApiKey) {
        this.baseUrl = trimTrailingSlash(qdrantUrl);

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(10));

        var builder = RestClient.builder()
                .requestFactory(factory)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE);

        if (qdrantApiKey != null && !qdrantApiKey.isBlank()) {
            builder.defaultHeader("api-key", qdrantApiKey);
        }

        this.restClient = builder.build();

        log.info("QdrantClient initialized – base URL: {}", this.baseUrl);
    }

    // ── Write ──────────────────────────────────────────────────────────────────

    @Override
    public void upsertVector(
            String chunkId,
            List<Float> denseVector,
            SparseVector sparseVector,
            Map<String, Object> pointPayload) {
        ensureCollection(denseVector.size());

        Map<String, Object> payload = new LinkedHashMap<>(pointPayload);

        NamedVectors namedVectors = new NamedVectors(denseVector, sparseVector);
        UpsertPoint point = new UpsertPoint(chunkId, namedVectors, payload);
        UpsertBody body = new UpsertBody(List.of(point));
        String url = baseUrl + "/collections/" + COLLECTION + "/points?wait=true";

        try {
            restClient.put()
                    .uri(url)
                    .body(body)
                    .retrieve()
                    .onStatus(status -> !status.is2xxSuccessful(), (req, res) -> {
                        throw new QdrantException("Failed to sync vector to Qdrant");
                    })
                    .toBodilessEntity();
            log.debug("Upserted chunkId={} into Qdrant", chunkId);
        } catch (RestClientException e) {
            throw new QdrantException("Failed to sync vector to Qdrant", e);
        }
    }

    @Override
    public void deleteByDocumentId(String documentId) {
        Map<String, Object> condition = Map.of(
                "key", "document_id",
                "match", Map.of("value", documentId));
        Map<String, Object> body = Map.of(
                "filter", Map.of("must", List.of(condition)));
        String url = baseUrl + "/collections/" + COLLECTION + "/points/delete?wait=true";

        try {
            restClient.post()
                    .uri(url)
                    .body(body)
                    .retrieve()
                    .onStatus(status -> status.value() == 404, (req, res) -> {
                        throw new CollectionNotFoundException();
                    })
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        throw new QdrantException("POST delete points", res.getStatusCode().value());
                    })
                    .toBodilessEntity();
            log.debug("Deleted Qdrant points for document {}", documentId);
        } catch (CollectionNotFoundException e) {
            log.debug("Qdrant collection '{}' does not exist; nothing to delete", COLLECTION);
        } catch (QdrantException e) {
            throw e;
        } catch (RestClientException e) {
            throw new QdrantException("Failed to delete document vectors from Qdrant", e);
        }
    }

    // ── Read ───────────────────────────────────────────────────────────────────

    @Override
    public List<QdrantSearchResult> findClosestChunks(
            List<Float> denseQueryVector,
            SparseVector sparseQueryVector,
            List<String> documentIds,
            int topK) {
        if (documentIds == null || documentIds.isEmpty()) {
            return List.of();
        }
        int safeTopK = Math.max(1, Math.min(topK, 20));
        Map<String, Object> filter = Map.of(
                "must", List.of(
                        Map.of("key", "document_id",
                                "match", Map.of("any", documentIds))
                )
        );

        Map<String, Object> body;
        if (sparseQueryVector == null || sparseQueryVector.indices().isEmpty()) {
            body = Map.of(
                    "query", denseQueryVector,
                    "using", "dense",
                    "filter", filter,
                    "limit", safeTopK,
                    "with_payload", false
            );
        } else {
            int candidateLimit = Math.min(100, Math.max(20, safeTopK * 4));
            body = Map.of(
                    "prefetch", List.of(
                            Map.of(
                                    "query", denseQueryVector,
                                    "using", "dense",
                                    "filter", filter,
                                    "limit", candidateLimit),
                            Map.of(
                                    "query", sparseQueryVector,
                                    "using", "sparse",
                                    "filter", filter,
                                    "limit", candidateLimit)),
                    "query", Map.of("rrf", Map.of()),
                    "limit", safeTopK,
                    "with_payload", false
            );
        }

        String url = baseUrl + "/collections/" + COLLECTION + "/points/query";

        try {
            Map<String, Object> response = restClient.post()
                    .uri(url)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        throw new QdrantException("POST search", res.getStatusCode().value());
                    })
                    .body(new ParameterizedTypeReference<>() {});

            if (response == null) {
                return List.of();
            }

            List<Map<String, Object>> results = resultPoints(response.get("result"));
            if (results == null || results.isEmpty()) {
                log.debug("Qdrant search returned no results for {} documents", documentIds.size());
                return List.of();
            }

            List<QdrantSearchResult> matches = new ArrayList<>();
            for (Map<String, Object> result : results) {
                Object id = result.get("id");
                if (id == null) {
                    continue;
                }
                matches.add(new QdrantSearchResult(String.valueOf(id), score(result.get("score"))));
            }
            log.debug("Qdrant returned {} hits for {} documents",
                    matches.size(), documentIds.size());
            return matches;
        } catch (QdrantException e) {
            throw e;
        } catch (Exception e) {
            log.error("Qdrant search failed for {} documents", documentIds.size(), e);
            throw new QdrantException("POST search", e.getMessage(), e);
        }
    }

    @Override
    public Map<String, Object> health() {
        Map<String, Object> info = new LinkedHashMap<>();
        long start = System.currentTimeMillis();
        try {
            restClient.get()
                    .uri(baseUrl + "/collections/" + COLLECTION)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        throw new QdrantException("Health check failed", res.getStatusCode().value());
                    })
                    .toBodilessEntity();
            info.put("status", "UP");
            info.put("latencyMs", System.currentTimeMillis() - start);
            info.put("collection", COLLECTION);
        } catch (Exception e) {
            info.put("status", "DOWN");
            info.put("latencyMs", System.currentTimeMillis() - start);
            info.put("error", e.getMessage());
        }
        return info;
    }

    // ── Collection bootstrap ───────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> resultPoints(Object result) {
        if (result instanceof List<?> list) {
            return (List<Map<String, Object>>) list;
        }
        if (result instanceof Map<?, ?> map) {
            Object points = map.get("points");
            if (points instanceof List<?> list) {
                return (List<Map<String, Object>>) list;
            }
        }
        return List.of();
    }

    private void ensureCollection(int vectorSize) {
        if (collectionEnsured) {
            return;
        }

        synchronized (this) {
            if (collectionEnsured) {
                return;
            }

            String checkUrl = baseUrl + "/collections/" + COLLECTION;
            try {
                restClient.get()
                        .uri(checkUrl)
                        .retrieve()
                        .onStatus(HttpStatusCode::isError, (req, res) -> {
                            if (res.getStatusCode().value() == 404) {
                                throw new CollectionNotFoundException();
                            }
                            throw new QdrantException("GET collection", res.getStatusCode().value());
                        })
                        .toBodilessEntity();

                log.info("Qdrant collection '{}' already exists", COLLECTION);
                collectionEnsured = true;
                return;
            } catch (CollectionNotFoundException ignored) {
                // Fall through to creation
            }

            // Create the collection with named vectors (dense + sparse)
            Map<String, Object> createBody = Map.of(
                    "vectors", Map.of(
                            "dense", Map.of("size", vectorSize, "distance", "Cosine")
                    ),
                    "sparse_vectors", Map.of(
                            "sparse", Map.of("modifier", "idf")
                    )
            );

            try {
                restClient.put()
                        .uri(checkUrl)
                        .body(createBody)
                        .retrieve()
                        .onStatus(HttpStatusCode::isError, (req, res) -> {
                            throw new QdrantException("PUT collection", res.getStatusCode().value());
                        })
                        .toBodilessEntity();

                log.info("Created Qdrant collection '{}' with named vectors (dense/sparse)",
                        COLLECTION);
                collectionEnsured = true;
            } catch (Exception e) {
                log.warn("Failed to create Qdrant collection '{}'. It may already exist " +
                         "from a concurrent request. Proceeding anyway.", COLLECTION, e);
                collectionEnsured = true;
            }
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private static String trimTrailingSlash(String url) {
        String normalized = url.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private static BigDecimal score(Object rawScore) {
        if (rawScore instanceof BigDecimal decimal) {
            return decimal;
        }
        if (rawScore instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        if (rawScore == null) {
            return BigDecimal.ZERO;
        }
        return new BigDecimal(String.valueOf(rawScore));
    }

    private static final class CollectionNotFoundException extends RuntimeException {
    }

}
