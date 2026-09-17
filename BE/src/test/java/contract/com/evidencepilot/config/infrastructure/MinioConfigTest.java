package com.evidencepilot.config.infrastructure;

import io.minio.GetPresignedObjectUrlArgs;
import io.minio.http.Method;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class MinioConfigTest {

    @Test
    void presignClientDoesNotConnectToPublicEndpoint() throws Exception {
        var client = new MinioConfig().minioPresignClient(
                "http://127.0.0.1:1",
                "test-access-key",
                "test-secret-key",
                "us-east-1");

        String url = client.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                .method(Method.GET)
                .bucket("test-bucket")
                .object("test.pdf")
                .build());

        assertTrue(url.startsWith("http://127.0.0.1:1/test-bucket/test.pdf?"));
    }
}
