package com.evidencepilot.service;

import io.minio.MinioClient;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import javax.sql.DataSource;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HealthServiceTest {

    @Test
    void reusesReadinessResultWithinCacheWindow() {
        AiModelClient aiModelClient = mock(AiModelClient.class);
        QdrantClient qdrantClient = mock(QdrantClient.class);
        when(aiModelClient.health()).thenReturn(Map.of("status", "ok"));
        when(qdrantClient.health()).thenReturn(Map.of("status", "UP"));

        HealthService service = new HealthService(
                mock(DataSource.class), aiModelClient, qdrantClient,
                mock(MinioClient.class), mock(RabbitTemplate.class));

        Map<String, Object> first = service.checkReadiness();
        Map<String, Object> second = service.checkReadiness();

        assertSame(first, second);
        verify(aiModelClient).health();
        verify(qdrantClient).health();
    }
}
