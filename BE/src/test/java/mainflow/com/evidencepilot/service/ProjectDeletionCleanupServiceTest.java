package com.evidencepilot.service;

import com.evidencepilot.model.ProjectDeletionCleanupTask;
import com.evidencepilot.model.ProjectDeletionCleanupTask.ResourceType;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectDeletionCleanupTaskRepository;
import com.evidencepilot.service.impl.QdrantServiceImpl;
import io.minio.errors.ErrorResponseException;
import io.minio.messages.ErrorResponse;
import okhttp3.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProjectDeletionCleanupServiceTest {

    @Mock
    private ProjectDeletionCleanupTaskRepository cleanupTaskRepository;

    @Mock
    private DocumentRepository documentRepository;

    @Mock
    private DocumentObjectStorage objectStorage;

    @Mock
    private QdrantServiceImpl qdrantService;

    private ProjectDeletionCleanupService cleanupService;

    @BeforeEach
    void setUp() {
        cleanupService = new ProjectDeletionCleanupService(
                cleanupTaskRepository,
                documentRepository,
                objectStorage,
                qdrantService
        );
    }

    private ProjectDeletionCleanupTask newTask(ResourceType type, String key, String guard) {
        ProjectDeletionCleanupTask task = new ProjectDeletionCleanupTask();
        task.setId(UUID.randomUUID());
        task.setProjectId(UUID.randomUUID());
        task.setResourceType(type);
        task.setResourceKey(key);
        task.setGuardKey(guard);
        task.setAttempts(0);
        task.setNextAttemptAt(LocalDateTime.now().minusMinutes(1));
        task.setCreatedAt(LocalDateTime.now().minusMinutes(10));
        return task;
    }

    @Test
    void cleanupOneMinioObjectSucceedsAndDeletesTask() {
        LocalDateTime now = LocalDateTime.now();
        ProjectDeletionCleanupTask task = newTask(ResourceType.MINIO_OBJECT, "documents/file.pdf", null);
        when(cleanupTaskRepository.findByIdForUpdate(task.getId())).thenReturn(Optional.of(task));

        boolean result = cleanupService.cleanupOne(task.getId(), now);

        assertThat(result).isTrue();
        verify(objectStorage).delete("documents/file.pdf");
        verify(cleanupTaskRepository).delete(task);
    }

    @Test
    void cleanupOneCacheObjectWhenHashUnusedDeletesMinioAndTask() {
        LocalDateTime now = LocalDateTime.now();
        String hash = "1234567890123456789012345678901234567890123456789012345678901234";
        String cacheKey = "documents/processed/cache/v3/sha256/" + hash + "/extraction.zip";
        ProjectDeletionCleanupTask task = newTask(ResourceType.MINIO_OBJECT_IF_HASH_UNUSED, cacheKey, hash);

        when(cleanupTaskRepository.findByIdForUpdate(task.getId())).thenReturn(Optional.of(task));
        when(documentRepository.existsByFileHashSha256(hash)).thenReturn(false);

        boolean result = cleanupService.cleanupOne(task.getId(), now);

        assertThat(result).isTrue();
        verify(objectStorage).delete(cacheKey);
        verify(cleanupTaskRepository).delete(task);
    }

    @Test
    void cleanupOneCacheObjectWhenHashStillUsedDoesNotDeleteMinioButDeletesTask() {
        LocalDateTime now = LocalDateTime.now();
        String hash = "1234567890123456789012345678901234567890123456789012345678901234";
        String cacheKey = "documents/processed/cache/v3/sha256/" + hash + "/extraction.zip";
        ProjectDeletionCleanupTask task = newTask(ResourceType.MINIO_OBJECT_IF_HASH_UNUSED, cacheKey, hash);

        when(cleanupTaskRepository.findByIdForUpdate(task.getId())).thenReturn(Optional.of(task));
        when(documentRepository.existsByFileHashSha256(hash)).thenReturn(true);

        boolean result = cleanupService.cleanupOne(task.getId(), now);

        assertThat(result).isTrue();
        verify(objectStorage, never()).delete(any());
        verify(cleanupTaskRepository).delete(task);
    }

    @Test
    void cleanupOneQdrantDocumentSucceedsAndDeletesTask() {
        LocalDateTime now = LocalDateTime.now();
        UUID docId = UUID.randomUUID();
        ProjectDeletionCleanupTask task = newTask(ResourceType.QDRANT_DOCUMENT, docId.toString(), null);

        when(cleanupTaskRepository.findByIdForUpdate(task.getId())).thenReturn(Optional.of(task));

        boolean result = cleanupService.cleanupOne(task.getId(), now);

        assertThat(result).isTrue();
        verify(qdrantService).deleteVectors(docId);
        verify(cleanupTaskRepository).delete(task);
    }

    @Test
    void cleanupOneFailureIncrementsAttemptsSetsNextAttemptAtAndDoesNotDeleteTask() {
        LocalDateTime now = LocalDateTime.now();
        ProjectDeletionCleanupTask task = newTask(ResourceType.MINIO_OBJECT, "documents/file.pdf", null);

        when(cleanupTaskRepository.findByIdForUpdate(task.getId())).thenReturn(Optional.of(task));
        doThrow(new RuntimeException("MinIO network failure")).when(objectStorage).delete("documents/file.pdf");

        boolean result = cleanupService.cleanupOne(task.getId(), now);

        assertThat(result).isFalse();
        assertThat(task.getAttempts()).isEqualTo(1);
        assertThat(task.getLastError()).contains("MinIO network failure");
        assertThat(task.getNextAttemptAt()).isAfterOrEqualTo(now.plusMinutes(14));
        verify(cleanupTaskRepository, never()).delete(task);
    }

    @Test
    void cleanupOneMissingResourceTreatedAsSuccess() {
        LocalDateTime now = LocalDateTime.now();
        ProjectDeletionCleanupTask task = newTask(ResourceType.MINIO_OBJECT, "documents/missing.pdf", null);

        when(cleanupTaskRepository.findByIdForUpdate(task.getId())).thenReturn(Optional.of(task));
        doThrow(new DocumentObjectStorage.DocumentStorageException("404 Not Found", null))
                .when(objectStorage).delete("documents/missing.pdf");

        boolean result = cleanupService.cleanupOne(task.getId(), now);

        assertThat(result).isTrue();
        verify(cleanupTaskRepository).delete(task);
    }

    @Test
    void futureTaskIsNotProcessed() {
        LocalDateTime now = LocalDateTime.now();
        ProjectDeletionCleanupTask task = newTask(ResourceType.MINIO_OBJECT, "documents/file.pdf", null);
        task.setNextAttemptAt(now.plusMinutes(10));

        when(cleanupTaskRepository.findByIdForUpdate(task.getId())).thenReturn(Optional.of(task));

        boolean result = cleanupService.cleanupOne(task.getId(), now);

        assertThat(result).isFalse();
        verifyNoInteractions(objectStorage, qdrantService);
        verify(cleanupTaskRepository, never()).delete(task);
    }
}
