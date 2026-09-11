package com.evidencepilot.service;

import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

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

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {TransactionSynchronization.STATUS_COMMITTED,
            TransactionSynchronization.STATUS_ROLLED_BACK, TransactionSynchronization.STATUS_UNKNOWN})
    void rollbackCleanupWaitsForCompletionAndRetainsCommittedObjects(int status) throws Exception {
        TransactionSynchronizationManager.initSynchronization();

        storage.deleteOnRollback("media/file.png");

        verifyNoInteractions(minioClient);
        var callbacks = TransactionSynchronizationManager.getSynchronizations();
        assertThat(callbacks).hasSize(1);
        callbacks.getFirst().afterCompletion(status);
        if (status == TransactionSynchronization.STATUS_COMMITTED) {
            verifyNoInteractions(minioClient);
        } else {
            verify(minioClient).removeObject(argThat(args ->
                    args.bucket().equals("test-bucket") && args.object().equals("media/file.png")));
        }
    }

    @Test
    void rollbackCleanupWithoutSynchronizationDoesNotDelete() {
        storage.deleteOnRollback("media/file.png");

        verifyNoInteractions(minioClient);
    }

    @Test
    void rollbackCleanupFailureDoesNotEscapeTransactionCompletion() throws Exception {
        TransactionSynchronizationManager.initSynchronization();
        doThrow(new RuntimeException("storage offline")).when(minioClient).removeObject(any());
        storage.deleteOnRollback("media/file.png");

        assertThatCode(() -> TransactionSynchronizationManager.getSynchronizations().getFirst()
                .afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK))
                .doesNotThrowAnyException();
        verify(minioClient).removeObject(any());
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

        assertThat(DocumentObjectStorage.extractionCacheKey(hash, true))
                .isEqualTo("documents/processed/cache/v3/sha256/" + hash + "/extraction.zip");
        assertThat(DocumentObjectStorage.extractionCacheKey(hash, false))
                .isEqualTo("documents/processed/cache/v3/sha256/" + hash + "/source-extraction.zip");
        assertThatThrownBy(() -> DocumentObjectStorage.extractionCacheKey("../not-a-hash", false))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
