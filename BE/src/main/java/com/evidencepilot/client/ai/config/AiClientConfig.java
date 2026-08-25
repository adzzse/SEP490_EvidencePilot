package com.evidencepilot.client.ai.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.concurrent.Semaphore;

/**
 * Spring configuration for the external Python model service.
 *
 * <p>Configuration keys (all overridable via environment variables):
 * <ul>
 *   <li>{@code ai.model.base-url}       / {@code AI_MODEL_BASE_URL}       - AI worker base URL</li>
 *   <li>{@code ai.model.api-key}        / {@code AI_MODEL_API_KEY}        - optional, sent as {@code X-API-Key}</li>
 *   <li>{@code ai.model.read-timeout-seconds} / {@code AI_MODEL_READ_TIMEOUT_SECONDS} - response timeout</li>
 *   <li>{@code ai.model.max-concurrent-requests} / {@code AI_MODEL_MAX_CONCURRENT_REQUESTS} - global cap on concurrent AI calls</li>
 * </ul>
 * </p>
 *
 * <p><b>ngrok compatibility:</b> The header {@code ngrok-skip-browser-warning: true}
 * is always added.  It is harmless on non-ngrok servers and required for ngrok-hosted
 * APIs to bypass the browser interstitial page that would otherwise corrupt JSON
 * responses when called programmatically.</p>
 */
@Configuration
public class AiClientConfig {

    @Value("${ai.model.base-url}")
    private String baseUrl;

    @Value("${ai.model.api-key:}")
    private String apiKey;

    @Value("${ai.model.read-timeout-seconds:660}")
    private long readTimeoutSeconds;

    @Value("${ai.model.max-concurrent-requests:4}")
    private int maxConcurrentRequests;

    /** Local backpressure; the database-backed gate enforces the shared limit. */
    @Bean("aiRequestLimiter")
    public Semaphore aiRequestLimiter() {
        return new Semaphore(Math.max(1, maxConcurrentRequests));
    }

    @Bean("aiModelBaseUrl")
    public String aiModelBaseUrl() {
        return baseUrl;
    }

    /**
     * Named bean {@code aiRestClient} injected into
     * {@link com.evidencepilot.service.AiModelClient}.
     */
    @Bean("aiRestClient")
    public RestClient aiRestClient() {
        return buildRestClient(readTimeoutSeconds);
    }

    @Bean("aiReviewRestClient")
    public RestClient aiReviewRestClient() {
        return buildRestClient(120);
    }

    private RestClient buildRestClient(long timeoutSeconds) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(5));
        requestFactory.setReadTimeout(Duration.ofSeconds(Math.max(1, timeoutSeconds)));

        RestClient.Builder builder = RestClient.builder()
                .requestFactory(requestFactory)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                // Bypass ngrok browser-interstitial for any ngrok-hosted AI endpoint
                .defaultHeader("ngrok-skip-browser-warning", "true");

        if (apiKey != null && !apiKey.isBlank()) {
            builder.defaultHeader("X-API-Key", apiKey);
        }

        return builder.build();
    }
}
