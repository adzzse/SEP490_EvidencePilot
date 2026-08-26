package com.evidencepilot.service;

import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class DocumentObjectStorageTest {

    @Mock
    private MinioClient minioClient;
    @Mock
    private MinioClient presignClient;

    private DocumentObjectStorage storage;

    @BeforeEach
    void setUp() {
        storage = new DocumentObjectStorage(minioClient, presignClient);
        ReflectionTestUtils.setField(storage, "bucketName", "test-bucket");
    }

    @Test
    void writeWithSha256HashesTheUploadedBytes() throws Exception {
        byte[] content = "abc".getBytes(StandardCharsets.UTF_8);

        String hash = storage.writeWithSha256("sources/raw/file.pdf", content, "application/pdf");

        assertThat(hash).isEqualTo(
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        verify(minioClient).putObject(any(PutObjectArgs.class));
    }

    @Test
    void deleteAndCheckpointKeysUseTheSameStorageBoundary() throws Exception {
        UUID documentId = UUID.randomUUID();

        storage.delete("media/file.png");

        verify(minioClient).removeObject(any(RemoveObjectArgs.class));
        assertThat(DocumentObjectStorage.extractionCheckpointKey(documentId, "hash"))
                .isEqualTo("documents/processed/" + documentId + "/hash/extraction.json");
        assertThat(DocumentObjectStorage.extractionCheckpointKey(documentId, null))
                .isEqualTo("documents/processed/" + documentId + "/extraction.json");
    }
    @Test
    void extractionCacheKeyUsesOnlyVersionedLowercaseSha256Paths() {
        String hash = "a".repeat(64);

        assertThat(DocumentObjectStorage.extractionCacheKey(hash))
                .isEqualTo("documents/processed/cache/v2/sha256/" + hash + "/extraction.zip");
        assertThatThrownBy(() -> DocumentObjectStorage.extractionCacheKey("../not-a-hash"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
