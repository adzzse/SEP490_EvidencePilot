package com.evidencepilot.service;

import com.evidencepilot.repository.ProjectDeletionCleanupTaskRepository;
import com.evidencepilot.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProjectDeletionSweeper {

    private final ProjectRepository projectRepository;
    private final ProjectDeletionPurgeService purgeService;
    private final ProjectDeletionCleanupTaskRepository cleanupTaskRepository;
    private final ProjectDeletionCleanupService cleanupService;

    @Scheduled(cron = "${app.project-deletion.sweep-cron:0 0 * * * *}")
    public void sweep() {
        LocalDateTime now = LocalDateTime.now();

        // 1. Purge due projects
        try {
            List<UUID> dueProjectIds = projectRepository.findIdsDueForDeletion(now, PageRequest.of(0, 100));
            for (UUID projectId : dueProjectIds) {
                try {
                    boolean purged = purgeService.purgeIfDue(projectId, now);
                    if (purged) {
                        log.info("Purged scheduled project projectId={} at {}", projectId, now);
                    }
                } catch (Exception e) {
                    log.error("Failed to purge project projectId={}", projectId, e);
                }
            }
        } catch (Exception e) {
            log.error("Failed to query due projects for deletion sweep", e);
        }

        // 2. Cleanup due external resources
        try {
            List<UUID> dueTaskIds = cleanupTaskRepository.findDueTaskIds(now, PageRequest.of(0, 100));
            for (UUID taskId : dueTaskIds) {
                try {
                    cleanupService.cleanupOne(taskId, now);
                } catch (Exception e) {
                    log.error("Failed to cleanup task taskId={}", taskId, e);
                }
            }
        } catch (Exception e) {
            log.error("Failed to query due cleanup tasks", e);
        }
    }
}
