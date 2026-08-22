package com.evidencepilot.service.impl;

import com.evidencepilot.config.infrastructure.RabbitMQConfig;
import com.evidencepilot.dto.ExportRequest;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.*;
import com.evidencepilot.model.enums.ExportFormat;
import com.evidencepilot.model.enums.ExportStatus;
import com.evidencepilot.repository.*;
import com.evidencepilot.service.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExportServiceImpl implements ExportService {

    private static final String EXPORT_MINIO_PREFIX = "exports/";

    private final ExportJobRepository exportJobRepository;
    private final ProjectRepository projectRepository;
    private final CurrentUserService currentUserService;
    private final SystemNotificationService systemNotificationService;
    private final DocumentObjectStorage documentObjectStorage;
    private final UserRepository userRepository;
    private final RabbitTemplate rabbitTemplate;
    private final TexArchiveBuilder texArchiveBuilder;

    @Override
    @Transactional
    public ExportJob createExportJob(UUID projectId, String format) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireProjectAccess(currentUser, project);

        ExportFormat exportFormat;
        try {
            exportFormat = ExportFormat.valueOf(format.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported format: " + format);
        }

        ExportJob job = new ExportJob();
        job.setProjectId(projectId);
        job.setUserId(currentUser.getId());
        job.setStatus(ExportStatus.PENDING);
        job.setFormat(exportFormat);
        job.setCreatedAt(LocalDateTime.now());
        job.setUpdatedAt(LocalDateTime.now());
        job = exportJobRepository.save(job);

        publishAfterCommit(new ExportRequest(job.getId(), projectId, currentUser.getId(), format));

        return job;
    }

    @Override
    @Transactional
    public ExportJob retryExport(UUID jobId) {
        ExportJob job = getJob(jobId);
        LocalDateTime retriedAt = LocalDateTime.now();
        if (job.getStatus() != ExportStatus.FAILED
                || exportJobRepository.retryFailed(
                        jobId, ExportStatus.FAILED, ExportStatus.PENDING, retriedAt) != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only failed exports can be retried");
        }

        job.setStatus(ExportStatus.PENDING);
        job.setErrorMessage(null);
        job.setDownloadUrl(null);
        job.setUpdatedAt(retriedAt);
        publishAfterCommit(new ExportRequest(
                job.getId(), job.getProjectId(), job.getUserId(),
                job.getFormat().name().toLowerCase(Locale.ROOT)));
        return job;
    }

    @Override
    public ExportJob getJob(UUID jobId) {
        User currentUser = currentUserService.requireCurrentUser();
        ExportJob job = exportJobRepository.findById(jobId)
                .orElseThrow(() -> new ResourceNotFoundException(jobId, "ExportJob"));
        Project project = projectRepository.findById(job.getProjectId())
                .orElseThrow(() -> new ResourceNotFoundException(job.getProjectId(), "Project"));
        currentUserService.requireProjectAccess(currentUser, project);
        return exposeDownloadEndpoint(job);
    }

    @Override
    public Resource downloadExport(UUID jobId) {
        ExportJob job = getJob(jobId);
        if (job.getStatus() != ExportStatus.READY) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Export not ready");
        }
        return new InputStreamResource(documentObjectStorage.getStream(EXPORT_MINIO_PREFIX + jobId + ".zip"));
    }

    @Override
    public List<ExportJob> getUserExports(UUID projectId) {
        User currentUser = currentUserService.requireCurrentUser();
        List<ExportJob> jobs = exportJobRepository.findByProjectIdAndUserIdOrderByCreatedAtDesc(
                projectId, currentUser.getId());
        jobs.forEach(this::exposeDownloadEndpoint);
        return jobs;
    }

    public void processExport(ExportJob job) {
        job.setStatus(ExportStatus.PROCESSING);
        job.setUpdatedAt(LocalDateTime.now());
        exportJobRepository.save(job);

        Path archivePath = null;
        String objectKey = EXPORT_MINIO_PREFIX + job.getId() + ".zip";
        boolean stored = false;
        try {
            archivePath = Files.createTempFile("evidencepilot-export-", ".zip");
            texArchiveBuilder.write(job.getProjectId(), archivePath);
            try (InputStream content = Files.newInputStream(archivePath)) {
                documentObjectStorage.write(
                        objectKey, content, Files.size(archivePath), "application/zip");
            }
            stored = true;

            job.setStatus(ExportStatus.READY);
            exposeDownloadEndpoint(job);
            job.setUpdatedAt(LocalDateTime.now());
            exportJobRepository.save(job);

            User user = userRepository.getReferenceById(job.getUserId());
            systemNotificationService.createNotification(
                    user, user, "EXPORT_READY", job.getId(),
                    "Export is ready for download.");
        } catch (Exception e) {
            log.error("Export failed for job {}", job.getId(), e);
            if (stored) {
                try {
                    documentObjectStorage.delete(objectKey);
                } catch (RuntimeException cleanupFailure) {
                    e.addSuppressed(cleanupFailure);
                }
            }
            job.setStatus(ExportStatus.FAILED);
            job.setErrorMessage(e.getMessage());
            job.setUpdatedAt(LocalDateTime.now());
            exportJobRepository.save(job);
        } finally {
            if (archivePath != null) {
                try {
                    Files.deleteIfExists(archivePath);
                } catch (IOException e) {
                    log.warn("Failed to delete temporary export archive {}", archivePath, e);
                }
            }
        }
    }

    private ExportJob exposeDownloadEndpoint(ExportJob job) {
        if (job.getStatus() == ExportStatus.READY) {
            job.setDownloadUrl("/api/exports/" + job.getId() + "/download");
        }
        return job;
    }

    private void publishAfterCommit(ExportRequest request) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    rabbitTemplate.convertAndSend(RabbitMQConfig.EXPORT_QUEUE, request);
                }
            });
        } else {
            rabbitTemplate.convertAndSend(RabbitMQConfig.EXPORT_QUEUE, request);
        }
    }
}
