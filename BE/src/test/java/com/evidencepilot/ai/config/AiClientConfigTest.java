package com.evidencepilot.ai.config;

import com.evidencepilot.client.ai.config.AiClientConfig;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;

class AiClientConfigTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(AiClientConfig.class);

    @Test
    void aiModelBaseUrlUsesOnlyConfiguredEnvironmentValue() {
        contextRunner
                .withPropertyValues(
                        "ai.model.local-base-url=http://127.0.0.1:8000",
                        "ai.model.ngrok-base-url=https://good-lumpish-headstone.ngrok-free.dev",
                        "ai.model.base-url=https://configured-ai.example.test")
                .run(context -> {
                    assertThat(context.getBean("aiModelBaseUrl", String.class))
                            .isEqualTo("https://configured-ai.example.test");
                    assertThat(context.containsBean("aiModelBaseUrls")).isFalse();
                });
    }

    @Test
    void appliesConfiguredReadTimeoutToReviewCalls() {
        contextRunner
                .withPropertyValues(
                        "ai.model.base-url=http://ai.test",
                        "ai.model.api-key=",
                        "ai.model.read-timeout-seconds=7")
                .run(context -> {
                    RestClient normal = context.getBean("aiRestClient", RestClient.class);
                    RestClient review = context.getBean("aiReviewRestClient", RestClient.class);

                    assertThat(readTimeout(normal)).isEqualTo(7_000);
                    assertThat(readTimeout(review)).isEqualTo(7_000);
                });
    }

    private static int readTimeout(RestClient client) {
        Object factory = ReflectionTestUtils.getField(client, "clientRequestFactory");
        assertThat(factory).isInstanceOf(SimpleClientHttpRequestFactory.class);
        return (int) ReflectionTestUtils.getField(factory, "readTimeout");
    }
}
