package com.evidencepilot.service;

import com.evidencepilot.model.ProjectDeletionCleanupTask;
import com.evidencepilot.model.ProjectDeletionCleanupTask.ResourceType;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectDeletionCleanupTaskRepository;
import com.evidencepilot.service.impl.QdrantServiceImpl;
import io.minio.errors.ErrorResponseException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectDeletionCleanupService {

    private final ProjectDeletionCleanupTaskRepository cleanupTaskRepository;
    private final DocumentRepository documentRepository;
    private final DocumentObjectStorage objectStorage;
    private final QdrantServiceImpl qdrantService;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean cleanupOne(UUID taskId, LocalDateTime now) {
        ProjectDeletionCleanupTask task = cleanupTaskRepository.findByIdForUpdate(taskId).orElse(null);
        if (task == null || task.getNextAttemptAt().isAfter(now)) {
            return false;
        }

        try {
            if (task.getResourceType() == ResourceType.MINIO_OBJECT) {
                safeDeleteMinio(task.getResourceKey());
            } else if (task.getResourceType() == ResourceType.MINIO_OBJECT_IF_HASH_UNUSED) {
                if (task.getGuardKey() != null && !documentRepository.existsByFileHashSha256(task.getGuardKey())) {
                    safeDeleteMinio(task.getResourceKey());
                }
            } else if (task.getResourceType() == ResourceType.QDRANT_DOCUMENT) {
                safeDeleteQdrant(UUID.fromString(task.getResourceKey()));
            }
            cleanupTaskRepository.delete(task);
            return true;
        } catch (RuntimeException failure) {
            task.setAttempts(task.getAttempts() + 1);
            task.setLastError(truncate(failure.getMessage(), 1000));
            task.setNextAttemptAt(now.plusMinutes(15));
            log.warn("Project cleanup will retry taskId={} projectId={} type={}",
                    task.getId(), task.getProjectId(), task.getResourceType(), failure);
            return false;
        }
    }

    private void safeDeleteMinio(String objectKey) {
        try {
            objectStorage.delete(objectKey);
        } catch (DocumentObjectStorage.DocumentStorageException e) {
            if (isNotFoundError(e)) {
                log.debug("MinIO object {} already missing, treating as deleted", objectKey);
                return;
            }
            throw e;
        }
    }

    private void safeDeleteQdrant(UUID documentId) {
        try {
            qdrantService.deleteVectors(documentId);
        } catch (RuntimeException e) {
            if (isNotFoundError(e)) {
                log.debug("Qdrant vectors for doc {} already missing, treating as deleted", documentId);
                return;
            }
            throw e;
        }
    }

    private boolean isNotFoundError(Throwable e) {
        Throwable cause = e;
        while (cause != null) {
            if (cause instanceof ErrorResponseException ere) {
                if (ere.response() != null && ere.response().code() == 404) {
                    return true;
                }
                if (ere.errorResponse() != null) {
                    String code = ere.errorResponse().code();
                    if ("NoSuchKey".equalsIgnoreCase(code) || "ResourceNotFound".equalsIgnoreCase(code)) {
                        return true;
                    }
                }
            }
            String msg = cause.getMessage();
            if (msg != null && (msg.contains("404") || msg.contains("NoSuchKey") || msg.contains("Object does not exist"))) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
