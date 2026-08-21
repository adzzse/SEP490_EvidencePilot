package com.evidencepilot.service;

import com.evidencepilot.dto.response.ProjectMediaResponse;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMedia;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.ProjectMediaRepository;
import com.evidencepilot.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;
import java.io.InputStream;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class MediaAssetService {

    private final ProjectMediaRepository projectMediaRepository;
    private final ProjectRepository projectRepository;
    private final DocumentObjectStorage objectStorage;
    private final CurrentUserService currentUserService;

    @Transactional
    public ProjectMediaResponse upload(MultipartFile file, UUID projectId) {
        User user = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        currentUserService.requireProjectWriteAccess(user, project);

        String originalName = file.getOriginalFilename();
        if (originalName == null || originalName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File name is required");
        }

        String texFilename = originalName.replaceAll("[^a-zA-Z0-9._-]", "_");
        String storageKey = "media/" + projectId + "/" + UUID.randomUUID() + "-" + texFilename;

        try (var in = file.getInputStream()) {
            objectStorage.write(storageKey, in, file.getSize(), file.getContentType());
        } catch (Exception e) {
            ResponseStatusException failure = new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Failed to upload to storage", e);
            deleteAfterFailedWrite(storageKey, failure);
            throw failure;
        }
        deleteAfterRollback(storageKey);

        ProjectMedia media = new ProjectMedia();
        media.setProject(project);
        media.setUploadedBy(user);
        media.setStorageKey(storageKey);
        media.setTexFilename(texFilename);
        media.setMimeType(file.getContentType());
        media.setUploadedAt(LocalDateTime.now());
        try {
            media = projectMediaRepository.saveAndFlush(media);
        } catch (RuntimeException e) {
            deleteAfterFailedWrite(storageKey, e);
            throw e;
        }

        return toResponse(media);
    }

    public List<ProjectMediaResponse> listByProject(UUID projectId) {
        User user = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        currentUserService.requireProjectAccess(user, project);
        return projectMediaRepository.findByProjectId(projectId).stream()
                .map(this::toResponse)
                .toList();
    }

    public ProjectMedia getMedia(UUID id) {
        return projectMediaRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Media not found"));
    }

    @Transactional
    public void importExtractedImage(
            Document source,
            String texFilename,
            InputStream content,
            long size,
            String mimeType) {
        Project project = source.getProject();
        if (project == null) {
            return;
        }
        String storageKey = "media/" + project.getId()
                + "/extracted/" + source.getId() + "/" + texFilename;
        if (projectMediaRepository.existsByProjectIdAndStorageKey(project.getId(), storageKey)) {
            return;
        }

        try {
            objectStorage.write(storageKey, content, size, mimeType);
        } catch (RuntimeException e) {
            deleteIfUnreferencedAfterFailedWrite(project.getId(), storageKey, e);
            throw e;
        }

        ProjectMedia media = new ProjectMedia();
        media.setProject(project);
        media.setUploadedBy(source.getUploadedBy());
        media.setStorageKey(storageKey);
        media.setTexFilename(texFilename);
        media.setMimeType(mimeType);
        media.setUploadedAt(LocalDateTime.now());
        try {
            projectMediaRepository.saveAndFlush(media);
        } catch (RuntimeException e) {
            deleteIfUnreferencedAfterFailedWrite(project.getId(), storageKey, e);
            throw e;
        }
    }

    public String getSignedUrl(UUID id) {
        ProjectMedia media = getMedia(id);
        User user = currentUserService.requireCurrentUser();
        currentUserService.requireProjectAccess(user, media.getProject());
        return objectStorage.presignedGetUrl(media.getStorageKey(), 60);
    }

    /**
     * Pre-signs download URLs for many media assets in one pass (single MinIO round-trip
     * per storage back-end call). Access is checked once per distinct project.
     */
    public Map<UUID, String> getSignedUrls(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        User user = currentUserService.requireCurrentUser();
        List<ProjectMedia> mediaList = projectMediaRepository.findAllById(
                ids.stream().distinct().toList());
        Map<UUID, String> urls = new HashMap<>(mediaList.size());
        Set<UUID> checkedProjects = new HashSet<>();
        for (ProjectMedia media : mediaList) {
            UUID projectId = media.getProject().getId();
            if (checkedProjects.add(projectId)) {
                currentUserService.requireProjectAccess(user, media.getProject());
            }
            urls.put(media.getId(), objectStorage.presignedGetUrl(media.getStorageKey(), 60));
        }
        return urls;
    }

    @Transactional
    public void delete(UUID id) {
        User user = currentUserService.requireCurrentUser();
        ProjectMedia media = projectMediaRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Media not found"));
        currentUserService.requireProjectWriteAccess(user, media.getProject());
        projectMediaRepository.delete(media);
        projectMediaRepository.flush();
        deleteAfterCommit(media.getStorageKey());
    }

    @Transactional
    public void deleteExtractedForDocument(Document source) {
        if (source.getProject() == null) {
            return;
        }
        String prefix = "media/" + source.getProject().getId()
                + "/extracted/" + source.getId() + "/";
        List<ProjectMedia> media = projectMediaRepository.findByStorageKeyStartingWith(prefix);
        if (media.isEmpty()) {
            return;
        }
        projectMediaRepository.deleteAll(media);
        projectMediaRepository.flush();
        media.forEach(item -> deleteAfterCommit(item.getStorageKey()));
    }

    private ProjectMediaResponse toResponse(ProjectMedia m) {
        return new ProjectMediaResponse(
                m.getId(),
                m.getProject().getId(),
                m.getUploadedBy().getId(),
                m.getStorageKey(),
                m.getTexFilename(),
                m.getMimeType(),
                m.getUploadedAt()
        );
    }

    private void deleteAfterFailedWrite(String storageKey, RuntimeException failure) {
        try {
            objectStorage.delete(storageKey);
        } catch (RuntimeException cleanupFailure) {
            failure.addSuppressed(cleanupFailure);
        }
    }

    private void deleteIfUnreferencedAfterFailedWrite(
            UUID projectId, String storageKey, RuntimeException failure) {
        try {
            if (!projectMediaRepository.existsByProjectIdAndStorageKey(projectId, storageKey)) {
                deleteAfterFailedWrite(storageKey, failure);
            }
        } catch (RuntimeException referenceCheckFailure) {
            failure.addSuppressed(referenceCheckFailure);
        }
    }

    private void deleteAfterRollback(String storageKey) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == TransactionSynchronization.STATUS_COMMITTED) {
                    return;
                }
                try {
                    objectStorage.delete(storageKey);
                } catch (RuntimeException e) {
                    log.warn("Failed to delete rolled-back media object {}", storageKey, e);
                }
            }
        });
    }

    private void deleteAfterCommit(String storageKey) {
        Runnable cleanup = () -> {
            try {
                objectStorage.delete(storageKey);
            } catch (RuntimeException e) {
                log.warn("Failed to delete unreferenced media object {}", storageKey, e);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cleanup.run();
                }
            });
        } else {
            cleanup.run();
        }
    }
}
