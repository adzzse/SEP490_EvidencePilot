package com.evidencepilot.client.openalex;

import com.evidencepilot.dto.openalex.OpenAlexWorkResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class OpenAlexClientImpl implements OpenAlexClient {

    private final RestClient restClient;
    private final String baseUrl;
    private final String apiKey;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    @org.springframework.beans.factory.annotation.Autowired
    public OpenAlexClientImpl(
            @Qualifier("openAlexRestClient") RestClient restClient,
            @Qualifier("openAlexBaseUrl") String baseUrl,
            @Qualifier("openAlexApiKey") String apiKey) {
        this(restClient, baseUrl, apiKey, HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(15))
                .build(), new ObjectMapper());
    }

    OpenAlexClientImpl(RestClient restClient, String baseUrl, String apiKey, HttpClient httpClient, ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.baseUrl = trimTrailingSlash(baseUrl);
        this.apiKey = apiKey;
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public OpenAlexWorkResponse fetchWork(String doi) {
        String normalized = DoiUtils.normalize(doi);
        if (normalized == null || !DoiUtils.isValid(normalized)) {
            throw new OpenAlexApiException("Invalid DOI: " + doi, HttpStatus.BAD_REQUEST.value());
        }

        String uri = baseUrl + "/works/" + DoiUtils.toOpenAlexId(normalized);
        if (apiKey != null && !apiKey.isBlank()) {
            uri += "?api_key=" + apiKey;
        }

        log.info("Fetching OpenAlex work: {}/works/{}", baseUrl, DoiUtils.toOpenAlexId(normalized));
        try {
            OpenAlexWorkResponse response = restClient.get()
                    .uri(uri)
                    .retrieve()
                    .body(OpenAlexWorkResponse.class);

            if (response == null) {
                throw new OpenAlexApiException("OpenAlex returned null response for DOI: " + doi,
                        HttpStatus.BAD_GATEWAY.value());
            }
            return response;
        } catch (RestClientResponseException e) {
            throw new OpenAlexApiException(
                    "OpenAlex lookup failed for DOI: " + doi + " (HTTP " + e.getStatusCode().value() + ")",
                    e.getStatusCode().value() == HttpStatus.NOT_FOUND.value()
                            ? HttpStatus.NOT_FOUND.value()
                            : HttpStatus.BAD_GATEWAY.value());
        } catch (RestClientException e) {
            throw new OpenAlexApiException("OpenAlex lookup failed for DOI: " + doi, e);
        }
    }

    @Override
    public OpenAlexWorkResponse fetchWorkById(String openAlexId) {
        if (openAlexId == null || openAlexId.isBlank()) {
            throw new OpenAlexApiException("Invalid OpenAlex ID: " + openAlexId, HttpStatus.BAD_REQUEST.value());
        }
        String id = openAlexId.contains("/works/") ? openAlexId.substring(openAlexId.lastIndexOf("/works/") + 7) : openAlexId;
        String uri = baseUrl + "/works/" + id;
        if (apiKey != null && !apiKey.isBlank()) {
            uri += "?api_key=" + apiKey;
        }
        log.info("Fetching OpenAlex work by ID: {}/works/{}", baseUrl, id);
        try {
            OpenAlexWorkResponse response = restClient.get()
                    .uri(uri)
                    .retrieve()
                    .body(OpenAlexWorkResponse.class);
            if (response == null) {
                throw new OpenAlexApiException("OpenAlex returned null response for ID: " + openAlexId,
                        HttpStatus.BAD_GATEWAY.value());
            }
            return response;
        } catch (RestClientResponseException e) {
            throw new OpenAlexApiException(
                    "OpenAlex lookup failed for ID: " + openAlexId + " (HTTP " + e.getStatusCode().value() + ")",
                    e.getStatusCode().value() == HttpStatus.NOT_FOUND.value()
                            ? HttpStatus.NOT_FOUND.value()
                            : HttpStatus.BAD_GATEWAY.value());
        } catch (RestClientException e) {
            throw new OpenAlexApiException("OpenAlex lookup failed for ID: " + openAlexId, e);
        }
    }

    @Override
    public List<OpenAlexWorkResponse> fetchCitedByWorks(String openAlexId, int limit) {
        String id = openAlexId.contains("/works/") ? openAlexId.substring(openAlexId.lastIndexOf("/works/") + 7) : openAlexId;
        String uri = baseUrl + "/works?filter=cites:" + id + "&sort=cited_by_count:desc&per_page=" + limit;
        if (apiKey != null && !apiKey.isBlank()) {
            uri += "&api_key=" + apiKey;
        }
        log.info("Fetching cited-by works for {} (limit {})", id, limit);
        return listWorks(uri);
    }

    @Override
    public List<OpenAlexWorkResponse> fetchWorksByIds(List<String> openAlexIds, String selectFields) {
        if (openAlexIds == null || openAlexIds.isEmpty()) return List.of();
        // OpenAlex allows at most 100 OR-filter values per request.
        if (openAlexIds.size() > 100) {
            var results = new java.util.ArrayList<OpenAlexWorkResponse>();
            for (int offset = 0; offset < openAlexIds.size(); offset += 100) {
                results.addAll(fetchWorksByIds(openAlexIds.subList(offset, Math.min(offset + 100, openAlexIds.size())), selectFields));
            }
            return results;
        }
        StringBuilder sb = new StringBuilder();
        for (String oid : openAlexIds) {
            String shortId = oid.contains("/") ? oid.substring(oid.lastIndexOf('/') + 1) : oid;
            if (sb.length() > 0) sb.append("|");
            sb.append(shortId);
        }
        String uri = baseUrl + "/works?filter=openalex:" + sb;
        if (selectFields != null && !selectFields.isBlank()) {
            uri += "&select=" + selectFields;
        }
        uri += "&per_page=200";
        if (apiKey != null && !apiKey.isBlank()) {
            uri += "&api_key=" + apiKey;
        }
        log.info("Batch-fetching {} works via filter=openalex:{}|...", openAlexIds.size(), openAlexIds.getFirst());
        return listWorks(uri);
    }

    @Override
    public InputStream downloadPdf(String oaUrl) {
        log.info("Downloading PDF from: {}", oaUrl);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(java.net.URI.create(oaUrl))
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .header("Accept", "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1")
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .header("Sec-Fetch-Dest", "document")
                    .header("Sec-Fetch-Mode", "navigate")
                    .header("Sec-Fetch-Site", "none")
                    .header("Sec-Fetch-User", "?1")
                    .header("Upgrade-Insecure-Requests", "1")
                    .timeout(Duration.ofSeconds(120))
                    .build();
            HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() >= 200 && response.statusCode() < 400) {
                return response.body();
            }
            throw new OpenAlexApiException(
                    "Download failed: HTTP " + response.statusCode() + " for " + oaUrl,
                    response.statusCode());
        } catch (OpenAlexApiException e) {
            throw e;
        } catch (Exception e) {
            throw new OpenAlexApiException("Failed to download PDF from " + oaUrl, e);
        }
    }

    private List<OpenAlexWorkResponse> listWorks(String uri) {
        try {
            String json = restClient.get().uri(uri).retrieve().body(String.class);
            Map<String, Object> page = objectMapper.readValue(json, new TypeReference<>() {});
            Object rawResults = page.get("results");
            if (!(rawResults instanceof List<?>)) throw new IllegalStateException("Missing OpenAlex results");
            String resultsJson = objectMapper.writeValueAsString(rawResults);
            return objectMapper.readValue(resultsJson, new TypeReference<List<OpenAlexWorkResponse>>() {});
        } catch (Exception e) {
            // Keep request URLs/API keys out of propagated errors and logs.
            throw new OpenAlexApiException("OpenAlex work list could not be loaded", HttpStatus.BAD_GATEWAY.value());
        }
    }

    private static String trimTrailingSlash(String url) {
        if (url == null || url.isBlank()) return "";
        String normalized = url.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }
}
