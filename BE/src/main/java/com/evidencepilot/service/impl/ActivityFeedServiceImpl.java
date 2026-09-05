package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.ActivityFeedItem;
import com.evidencepilot.dto.response.ActivityFeedResponse;
import com.evidencepilot.model.AuditLog;
import com.evidencepilot.model.Collection;
import com.evidencepilot.model.CollectionCategory;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.AuditLogRepository;
import com.evidencepilot.repository.CollectionCategoryRepository;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.ActivityFeedService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ActivityFeedServiceImpl implements ActivityFeedService {

    private final UserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final ProjectRepository projectRepository;
    private final CollectionCategoryRepository collectionCategoryRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final DocumentRepository documentRepository;
    private final CollectionRepository collectionRepository;

    @Override
    @Transactional(readOnly = true)
    public ActivityFeedResponse getMyActivity(UUID userId, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 100));
        var user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return new ActivityFeedResponse(null, List.of());
        }
        var page = auditLogRepository.findByActorIdOrderByOccurredAtDesc(userId, PageRequest.of(0, safeLimit));
        var items = user.getRole() == UserRole.INSTRUCTOR
                ? projectInstructor(userId, page.getContent())
                : projectStudent(userId, page.getContent());
        return new ActivityFeedResponse(user.getRole(), items);
    }

    private List<ActivityFeedItem> projectInstructor(UUID userId, List<AuditLog> rows) {
        List<ActivityFeedItem> items = new ArrayList<>();
        for (AuditLog log : rows) {
            if (items.size() >= 50) break;
            switch (log.getEntityType()) {
                case "PROJECT" -> asProjectItem(log, "/instructor/projects/").ifPresent(items::add);
                case "COLLECTION" -> asCollectionItem(log).ifPresent(items::add);
                case "COLLECTION_CATEGORY" -> asCollectionCategoryItem(log).ifPresent(items::add);
                case "PaperSection" -> asPaperSectionProjectItem(log, "/instructor/projects/").ifPresent(items::add);
                case "DOCUMENT" -> asSourceItem(log).ifPresent(items::add);
                default -> { /* skip */ }
            }
        }
        return items;
    }

    private List<ActivityFeedItem> projectStudent(UUID userId, List<AuditLog> rows) {
        List<ActivityFeedItem> items = new ArrayList<>();
        for (AuditLog log : rows) {
            if (items.size() >= 50) break;
            // Students see their own project/section activity. All links target the
            // student workspace — never /instructor/... — so the FE never sends a
            // student to an instructor-only page.
            switch (log.getEntityType()) {
                case "PROJECT" -> asProjectItem(log, "/student/projects/").ifPresent(items::add);
                case "PaperSection" -> asStudentProjectSectionItem(log).ifPresent(items::add);
                default -> { /* skip */ }
            }
        }
        return items;
    }

    /**
     * Maps a PROJECT audit log to a project activity item. The action is used as
     * the subtitle (e.g. "Created", "Updated", "Section updated").
     */
    private Optional<ActivityFeedItem> asProjectItem(AuditLog log, String pathPrefix) {
        if (log.getEntityId() == null) return Optional.empty();
        Project p = projectRepository.findById(log.getEntityId()).orElse(null);
        if (p == null || !p.isActive()) return Optional.empty();
        long members = p.getProjectMembers() != null ? p.getProjectMembers().size() : 0L;
        return Optional.of(new ActivityFeedItem(
                "project",
                p.getId(),
                p.getId(),
                p.getTitle(),
                actionLabel(log.getAction()),
                null,
                members,
                p.getStatus() != null ? p.getStatus().name() : null,
                pathPrefix + p.getId(),
                log.getOccurredAt()
        ));
    }

    /**
     * Maps a COLLECTION audit log (instructor-only) to a Collection Detail
     * item carrying the live source count.
     */
    private Optional<ActivityFeedItem> asCollectionItem(AuditLog log) {
        if (log.getEntityId() == null) return Optional.empty();
        Collection c = collectionRepository.findById(log.getEntityId()).orElse(null);
        if (c == null || !c.isActive()) return Optional.empty();
        long total = documentRepository.findByCollectionId(c.getId()).stream()
                .filter(Document::isActive).count();
        return Optional.of(new ActivityFeedItem(
                "collection",
                c.getId(),
                null,
                c.getTitle(),
                actionLabel(log.getAction()),
                total,
                null,
                null,
                "/instructor/collections/" + c.getId(),
                log.getOccurredAt()
        ));
    }

    /**
     * Maps a COLLECTION_CATEGORY audit log (instructor-only). Shows the category
     * name and links to the source library where categories are managed.
     */
    private Optional<ActivityFeedItem> asCollectionCategoryItem(AuditLog log) {
        if (log.getEntityId() == null) return Optional.empty();
        CollectionCategory category = collectionCategoryRepository.findById(log.getEntityId()).orElse(null);
        String title = category != null ? category.getName() : "Source Category";
        return Optional.of(new ActivityFeedItem(
                "collection",
                log.getEntityId(),
                null,
                title,
                actionLabel(log.getAction()),
                null,
                null,
                null,
                "/instructor/source-library",
                log.getOccurredAt()
        ));
    }

    /**
     * Maps a PaperSection audit log (e.g. SECTION_CONTENT_UPDATED) back to its
     * parent project so the activity link navigates to the project workspace.
     * {@code projectId} is set so the FE can deep-link a student into the
     * specific section via /student/projects/{projectId}/sections/{sectionId}.
     */
    private Optional<ActivityFeedItem> asPaperSectionProjectItem(AuditLog log, String pathPrefix) {
        if (log.getEntityId() == null) return Optional.empty();
        PaperSection s = paperSectionRepository.findById(log.getEntityId()).orElse(null);
        if (s == null || s.getDocument() == null || s.getDocument().getProject() == null) return Optional.empty();
        Project p = s.getDocument().getProject();
        if (!p.isActive()) return Optional.empty();
        return Optional.of(new ActivityFeedItem(
                "project",
                s.getId(),
                p.getId(),
                p.getTitle(),
                "Section: " + (s.getSectionTitle() != null ? s.getSectionTitle() : "Untitled"),
                null,
                p.getProjectMembers() != null ? (long) p.getProjectMembers().size() : null,
                p.getStatus() != null ? p.getStatus().name() : null,
                pathPrefix + p.getId(),
                log.getOccurredAt()
        ));
    }

    /**
     * Student-specific section mapper: link goes to the project root
     * (no /sections/... suffix). {@code entityId} carries the section id,
     * {@code projectId} carries the parent project id.
     */
    private Optional<ActivityFeedItem> asStudentProjectSectionItem(AuditLog log) {
        if (log.getEntityId() == null) return Optional.empty();
        PaperSection s = paperSectionRepository.findById(log.getEntityId()).orElse(null);
        if (s == null || s.getDocument() == null || s.getDocument().getProject() == null) return Optional.empty();
        Project p = s.getDocument().getProject();
        if (!p.isActive()) return Optional.empty();
        return Optional.of(new ActivityFeedItem(
                "project-section",
                s.getId(),
                p.getId(),
                p.getTitle(),
                s.getSectionTitle() != null ? s.getSectionTitle() : "Section",
                null,
                null,
                null,
                "/student/projects/" + p.getId(),
                log.getOccurredAt()
        ));
    }

    /**
     * Maps a DOCUMENT audit log (e.g. DOCUMENT_UPLOADED) to a Source Library item.
     * Only emitted for instructors — sources are an instructor surface.
     */
    private Optional<ActivityFeedItem> asSourceItem(AuditLog log) {
        if (log.getEntityId() == null) return Optional.empty();
        Document d = documentRepository.findById(log.getEntityId()).orElse(null);
        if (d == null || !d.isActive()) return Optional.empty();
        return Optional.of(new ActivityFeedItem(
                "source",
                d.getId(),
                d.getProject() != null ? d.getProject().getId() : null,
                d.getOriginalFilename() != null ? d.getOriginalFilename() : "Untitled source",
                actionLabel(log.getAction()),
                null,
                null,
                d.getProcessingStatus() != null ? d.getProcessingStatus().name() : null,
                "/instructor/source-library",
                log.getOccurredAt()
        ));
    }

    private String actionLabel(String action) {
        if (action == null) return null;
        return switch (action) {
            case "PROJECT_CREATED" -> "Created";
            case "PROJECT_UPDATED" -> "Updated";
            case "PROJECT_COMPLETED" -> "Completed";
            case "PROJECT_ARCHIVED" -> "Archived";
            case "PROJECT_UNARCHIVED" -> "Unarchived";
            case "PROJECT_MEMBER_ADDED" -> "Member added";
            case "PROJECT_MEMBER_ROLE_CHANGED" -> "Member role changed";
            case "PROJECT_MEMBER_REMOVED" -> "Member removed";
            case "SECTION_CONTENT_UPDATED" -> "Section updated";
            case "SECTION_ASSIGNED" -> "Section assigned";
            case "FEEDBACK_ANSWERED" -> "Feedback answered";
            case "EXPORT_READY" -> "Export ready";
            case "DOCUMENT_UPLOADED" -> "Uploaded";
            case "COLLECTION_CATEGORY_CREATED" -> "Category created";
            case "COLLECTION_CATEGORY_UPDATED" -> "Category updated";
            case "COLLECTION_CATEGORY_DELETED" -> "Category deleted";
            case "COLLECTION_CREATED" -> "Created";
            case "COLLECTION_UPDATED" -> "Updated";
            case "COLLECTION_DELETED" -> "Deleted";
            case "AI_SECTION_CITATION_REVIEW" -> "Citation reviewed";
            default -> action;
        };
    }
}

