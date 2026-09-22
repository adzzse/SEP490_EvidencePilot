package com.evidencepilot.service;

import com.evidencepilot.model.*;
import com.evidencepilot.model.ProjectDeletionCleanupTask.ResourceType;
import com.evidencepilot.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectDeletionPurgeService {

    private final ProjectRepository projectRepository;
    private final DocumentRepository documentRepository;
    private final CollectionDocumentRepository collectionDocumentRepository;
    private final ProjectDocumentRepository projectDocumentRepository;
    private final ProjectMediaRepository projectMediaRepository;
    private final FeedbackAttachmentRepository feedbackAttachmentRepository;
    private final ExportJobRepository exportJobRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final FeedbackRequestRepository feedbackRequestRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final SystemNotificationRepository systemNotificationRepository;
    private final ProjectDeletionCleanupTaskRepository cleanupTaskRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean purgeIfDue(UUID projectId, LocalDateTime now) {
        Project project = projectRepository.findByIdForUpdate(projectId).orElse(null);
        if (project == null || project.getDeletionScheduledAt() == null
                || project.getDeletionScheduledAt().isAfter(now)) {
            return false;
        }

        List<Document> direct = documentRepository.findByProjectId(projectId);
        List<Document> exclusive = direct.stream().filter(doc -> isProjectExclusive(projectId, doc)).toList();
        List<Document> preserved = direct.stream().filter(doc -> !exclusive.contains(doc)).toList();

        List<ProjectDeletionCleanupTask> tasks = buildCleanupTasks(projectId, exclusive, now);
        cleanupTaskRepository.saveAll(tasks);

        purgeSystemNotifications(projectId);

        preserved.forEach(doc -> doc.setProject(null));
        if (!preserved.isEmpty()) {
            documentRepository.saveAll(preserved);
        }

        exclusive.forEach(documentRepository::delete);
        documentRepository.flush();

        projectRepository.delete(project);
        return true;
    }

    private boolean isProjectExclusive(UUID projectId, Document doc) {
        if (doc.getCollection() != null) {
            return false;
        }
        if (!collectionDocumentRepository.findByDocumentId(doc.getId()).isEmpty()) {
            return false;
        }
        boolean linkedToOtherProject = projectDocumentRepository.findByDocumentId(doc.getId()).stream()
                .anyMatch(pd -> pd.getProject() != null && !pd.getProject().getId().equals(projectId));
        return !linkedToOtherProject;
    }

    private List<ProjectDeletionCleanupTask> buildCleanupTasks(UUID projectId, List<Document> exclusive, LocalDateTime now) {
        Map<String, ProjectDeletionCleanupTask> taskMap = new LinkedHashMap<>();

        // 1. Exclusive documents
        for (Document doc : exclusive) {
            if (doc.getFileUrl() != null && !doc.getFileUrl().isBlank() && !"pending".equals(doc.getFileUrl())) {
                addTask(taskMap, projectId, ResourceType.MINIO_OBJECT, doc.getFileUrl(), null, now);
            }

            String currentCp = DocumentObjectStorage.extractionCheckpointKey(doc.getId(), doc.getFileHashSha256());
            addTask(taskMap, projectId, ResourceType.MINIO_OBJECT, currentCp, null, now);

            String legacyCp = DocumentObjectStorage.extractionCheckpointKey(doc.getId(), null);
            if (!legacyCp.equals(currentCp)) {
                addTask(taskMap, projectId, ResourceType.MINIO_OBJECT, legacyCp, null, now);
            }

            String hash = doc.getFileHashSha256();
            if (hash != null && hash.length() == 64) {
                String cacheKey1 = DocumentObjectStorage.extractionCacheKey(hash, true);
                addTask(taskMap, projectId, ResourceType.MINIO_OBJECT_IF_HASH_UNUSED, cacheKey1, hash, now);
                String cacheKey2 = DocumentObjectStorage.extractionCacheKey(hash, false);
                addTask(taskMap, projectId, ResourceType.MINIO_OBJECT_IF_HASH_UNUSED, cacheKey2, hash, now);
            }

            addTask(taskMap, projectId, ResourceType.QDRANT_DOCUMENT, doc.getId().toString(), null, now);
        }

        // 2. Project Media
        List<ProjectMedia> mediaList = projectMediaRepository.findByProjectId(projectId);
        for (ProjectMedia media : mediaList) {
            if (media.getStorageKey() != null && !media.getStorageKey().isBlank()) {
                addTask(taskMap, projectId, ResourceType.MINIO_OBJECT, media.getStorageKey(), null, now);
            }
        }

        // 3. Feedback Attachments
        List<String> attachmentKeys = feedbackAttachmentRepository.findStorageKeysByProjectId(projectId);
        for (String key : attachmentKeys) {
            if (key != null && !key.isBlank()) {
                addTask(taskMap, projectId, ResourceType.MINIO_OBJECT, key, null, now);
            }
        }

        // 4. Exports
        List<ExportJob> exportJobs = exportJobRepository.findByProjectId(projectId);
        for (ExportJob job : exportJobs) {
            addTask(taskMap, projectId, ResourceType.MINIO_OBJECT, "exports/" + job.getId() + ".csv", null, now);
            addTask(taskMap, projectId, ResourceType.MINIO_OBJECT, "exports/" + job.getId() + ".zip", null, now);
        }

        return new ArrayList<>(taskMap.values());
    }

    private void addTask(Map<String, ProjectDeletionCleanupTask> taskMap,
                         UUID projectId,
                         ResourceType resourceType,
                         String resourceKey,
                         String guardKey,
                         LocalDateTime now) {
        String mapKey = resourceType.name() + ":" + resourceKey;
        if (taskMap.containsKey(mapKey)) {
            return;
        }
        ProjectDeletionCleanupTask task = new ProjectDeletionCleanupTask();
        task.setProjectId(projectId);
        task.setResourceType(resourceType);
        task.setResourceKey(resourceKey);
        task.setGuardKey(guardKey);
        task.setAttempts(0);
        task.setNextAttemptAt(now);
        task.setCreatedAt(now);
        taskMap.put(mapKey, task);
    }

    private void purgeSystemNotifications(UUID projectId) {
        Set<UUID> entityIds = new HashSet<>();
        entityIds.add(projectId);

        List<PaperSection> sections = paperSectionRepository.findByDocument_Project_IdOrderByDocument_IdAscSectionOrderAsc(projectId);
        sections.forEach(s -> entityIds.add(s.getId()));

        List<ProjectMedia> media = projectMediaRepository.findByProjectId(projectId);
        media.forEach(m -> entityIds.add(m.getId()));

        List<ExportJob> exportJobs = exportJobRepository.findByProjectId(projectId);
        exportJobs.forEach(j -> entityIds.add(j.getId()));

        List<FeedbackRequest> requests = feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(projectId);
        requests.forEach(r -> entityIds.add(r.getId()));

        List<InstructorFeedback> feedbacks = instructorFeedbackRepository.findByRequestProjectId(projectId);
        Set<UUID> feedbackIds = new HashSet<>();
        feedbacks.forEach(f -> {
            entityIds.add(f.getId());
            feedbackIds.add(f.getId());
        });

        if (!entityIds.isEmpty() && !feedbackIds.isEmpty()) {
            systemNotificationRepository.deleteByEntityIdInOrFeedbackIdIn(entityIds, feedbackIds);
        } else if (!entityIds.isEmpty()) {
            systemNotificationRepository.deleteByEntityIdIn(entityIds);
        } else if (!feedbackIds.isEmpty()) {
            systemNotificationRepository.deleteByFeedbackIdIn(feedbackIds);
        }
    }
}
