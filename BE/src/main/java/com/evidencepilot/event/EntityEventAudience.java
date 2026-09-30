package com.evidencepilot.event;

import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectCollectionRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Phase 0: recipient-scoped entity-event delivery.
 *
 * <p>{@code /topic/entities} used to broadcast every change to every
 * authenticated session, leaking existence, timing, and UUIDs of unrelated
 * projects. Recipients are now resolved per event — project members (or the
 * directly affected user) plus ADMINs, who need cross-project visibility for
 * the admin console. Unknown or unresolvable audiences fall closed to ADMINs
 * only and log a warning; live views also reconcile via polling/refetch.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class EntityEventAudience {

    private final UserRepository users;
    private final ProjectMemberRepository members;
    private final DocumentRepository documents;
    private final CollectionRepository collections;
    private final ProjectCollectionRepository projectCollections;

    @Transactional(readOnly = true)
    public Set<UUID> recipients(EntityChangedEvent event) {
        Set<UUID> ids = new LinkedHashSet<>();
        if (event == null || event.entity() == null) return ids;
        addRole(ids, UserRole.ADMIN);
        switch (event.entity()) {
            case "USER" -> {
                if (event.id() != null) ids.add(event.id());
            }
            case "PROJECT" -> {
                if (event.id() != null) addProjectMembers(ids, event.id());
            }
            case "CATEGORY" -> addRole(ids, UserRole.INSTRUCTOR);
            case "COLLECTION" -> resolveCollection(ids, event);
            case "DOCUMENT" -> resolveDocument(ids, event);
            case "FEEDBACK", "REFERENCE", "EVIDENCE" -> resolveProject(ids, event.projectId(), event);
            default -> log.warn("entity_event_unknown_audience entity={} action={}",
                    event.entity(), event.action());
        }
        return ids;
    }

    private void resolveProject(Set<UUID> ids, UUID projectId, EntityChangedEvent event) {
        if (projectId != null) {
            addProjectMembers(ids, projectId);
        } else {
            log.warn("entity_event_missing_project entity={} action={} id={}",
                    event.entity(), event.action(), event.id());
        }
    }

    private void resolveCollection(Set<UUID> ids, EntityChangedEvent event) {
        if (event.projectId() != null) {
            addProjectMembers(ids, event.projectId());
            return;
        }
        if (event.id() == null) return;
        var collection = collections.findById(event.id()).orElse(null);
        if (collection == null) {
            log.warn("entity_event_unknown_collection id={}", event.id());
            return;
        }
        if (collection.getInstructor() != null) ids.add(collection.getInstructor().getId());
        projectCollections.findByCollectionId(collection.getId())
                .forEach(link -> {
                    if (link.getProject() != null) addProjectMembers(ids, link.getProject().getId());
                });
    }

    private void resolveDocument(Set<UUID> ids, EntityChangedEvent event) {
        if (event.projectId() != null) {
            addProjectMembers(ids, event.projectId());
            return;
        }
        if (event.id() == null) return;
        var document = documents.findById(event.id()).orElse(null);
        if (document == null) {
            log.warn("entity_event_unknown_document id={}", event.id());
            return;
        }
        if (document.getProject() != null) addProjectMembers(ids, document.getProject().getId());
        if (document.getUploadedBy() != null) ids.add(document.getUploadedBy().getId());
    }

    private void addProjectMembers(Set<UUID> ids, UUID projectId) {
        members.findByProjectId(projectId).stream()
                .filter(member -> member.getUser() != null)
                .map(member -> member.getUser().getId())
                .forEach(ids::add);
    }

    private void addRole(Set<UUID> ids, UserRole role) {
        users.findByRole(role).stream()
                .map(user -> user.getId())
                .forEach(ids::add);
    }
}
