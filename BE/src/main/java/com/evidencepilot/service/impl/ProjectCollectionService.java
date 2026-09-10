package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.CollectionResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Collection;
import com.evidencepilot.model.CollectionDocument;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectCollection;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.CollectionDocumentRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectCollectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProjectCollectionService {

    private static final Set<ProjectStatus> SYNC_PAUSED_STATUSES = Set.of(
            ProjectStatus.SUBMITTED_FOR_REVIEW,
            ProjectStatus.APPROVED,
            ProjectStatus.ARCHIVED);

    private final ProjectCollectionRepository projectCollectionRepository;
    private final ProjectDocumentRepository projectDocumentRepository;
    private final ProjectRepository projectRepository;
    private final CollectionRepository collectionRepository;
    private final DocumentRepository documentRepository;
    private final CollectionDocumentRepository collectionDocumentRepository;
    private final CurrentUserService currentUserService;

    /**
     * Seed-only collection creation: no auth checks, the seed job runs as
     * ADMIN and membership comes from the sheet, not the requester.
     */
    @Transactional
    public Collection createSeedCollection(User owner, String title, String description) {
        Collection collection = new Collection();
        collection.setTitle(title);
        collection.setDescription(description);
        collection.setInstructor(owner);
        collection.setActive(true);
        collection.setCreatedAt(LocalDateTime.now());
        return collectionRepository.save(collection);
    }

        public List<CollectionResponse> getLinkedCollections(UUID projectId) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = requireActiveProject(projectId);
        currentUserService.requireProjectAccess(currentUser, project);
        return projectCollectionRepository.findByProjectId(projectId).stream()
                .map(ProjectCollection::getCollection)
                .filter(Collection::isActive)
                .map(CollectionResponse::from)
                .toList();
    }

    @Transactional
    public CollectionResponse link(UUID projectId, UUID collectionId) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = requireActiveProject(projectId);
        Collection collection = requireActiveCollection(collectionId);
        currentUserService.requireCollectionAccess(currentUser, collection);
        requireSyncWriteAccess(currentUser, project);

        ProjectCollection link = projectCollectionRepository
                .findByProjectIdAndCollectionId(projectId, collectionId)
                .orElseGet(() -> {
                    ProjectCollection created = new ProjectCollection();
                    created.setProject(project);
                    created.setCollection(collection);
                    created.setLinkedBy(currentUser);
                    created.setLinkedAt(LocalDateTime.now());
                    return projectCollectionRepository.save(created);
                });

        syncCollection(link);
        return CollectionResponse.from(collection);
    }

    @Transactional
    public void unlink(UUID projectId, UUID collectionId) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = requireActiveProject(projectId);
        Collection collection = requireActiveCollection(collectionId);
        currentUserService.requireCollectionAccess(currentUser, collection);
        requireSyncWriteAccess(currentUser, project);

        projectCollectionRepository.findByProjectIdAndCollectionId(projectId, collectionId)
                .ifPresent(link -> {
                    detachCollectionLink(link);
                    projectCollectionRepository.delete(link);
                });
    }

    @Transactional
    public void syncSource(Document document) {
        if (document == null || document.getDocType() != DocumentType.SOURCE || !document.isActive()) {
            return;
        }
        for (Collection collection : sourceCollections(document)) {
            syncCollectionSource(collection, document);
        }
    }

    @Transactional
    public void syncProject(Project project) {
        if (project == null || !project.isActive() || isSyncPaused(project)) {
            return;
        }
        for (ProjectCollection link : projectCollectionRepository.findByProjectId(project.getId())) {
            syncCollection(link);
        }
    }

    @Transactional
    public void prepareCollectionDeletion(Collection collection) {
        List<ProjectCollection> links = projectCollectionRepository.findByCollectionId(collection.getId());
        for (ProjectCollection link : links) {
            for (ProjectDocument projectDocument : projectDocumentRepository
                    .findByProjectCollectionId(link.getId())) {
                ProjectCollection replacement = replacementLink(projectDocument, link);
                if (replacement != null) {
                    projectDocument.setProjectCollection(replacement);
                    projectDocumentRepository.save(projectDocument);
                } else {
                    projectDocument.setPinned(true);
                    projectDocument.setProjectCollection(null);
                    projectDocumentRepository.save(projectDocument);
                }
            }
        }
        projectCollectionRepository.deleteAll(links);
        collectionDocumentRepository.deleteAll(
                collectionDocumentRepository.findByCollectionId(collection.getId()));

        List<Document> retained = documentRepository
                .findByCollectionIdAndDocTypeAndActiveTrue(collection.getId(), DocumentType.SOURCE).stream()
                .filter(document -> projectDocumentRepository.existsByDocumentId(document.getId()))
                .peek(document -> document.setCollection(null))
                .toList();
        documentRepository.saveAll(retained);
    }

    @Transactional
    public Document addSource(Document document, Collection targetCollection, User addedBy) {
        if (isInCollection(document, targetCollection.getId())) {
            syncCollectionSource(targetCollection, document);
            return document;
        }

        CollectionDocument membership = new CollectionDocument();
        membership.setCollection(targetCollection);
        membership.setDocument(document);
        membership.setAddedBy(addedBy);
        membership.setAddedAt(LocalDateTime.now());
        collectionDocumentRepository.save(membership);
        syncCollectionSource(targetCollection, document);
        return document;
    }

    @Transactional
    public void removeSource(Document document, Collection collection) {
        if (document.getCollection() != null
                && Objects.equals(document.getCollection().getId(), collection.getId())) {
            detachCollectionSource(collection, document);
            document.setCollection(null);
            documentRepository.save(document);
            return;
        }
        collectionDocumentRepository
                .findByCollectionIdAndDocumentId(collection.getId(), document.getId())
                .ifPresent(membership -> {
                    collectionDocumentRepository.delete(membership);
                    detachCollectionSource(collection, document);
                });
    }

    @Transactional
    public void removeSource(Document document) {
        for (ProjectDocument projectDocument : projectDocumentRepository.findByDocumentId(document.getId())) {
            requireCorpusMutable(projectDocument.getProject());
            projectDocumentRepository.delete(projectDocument);
        }
    }

    @Transactional
    public void pinSource(Project project, Document document, User sharedBy) {
        pinSource(project, document, document.getCollection(), sharedBy);
    }

    @Transactional
    public void pinSource(Project project, Document document, Collection sourceCollection, User sharedBy) {
        requireCorpusMutable(project);
        ProjectCollection link = sourceCollection == null ? null
                : projectCollectionRepository
                        .findByProjectIdAndCollectionId(project.getId(), sourceCollection.getId())
                        .orElse(null);
        ProjectDocument projectDocument = projectDocumentRepository
                .findByProjectIdAndDocumentId(project.getId(), document.getId())
                .orElseGet(() -> {
                    ProjectDocument created = new ProjectDocument();
                    created.setProject(project);
                    created.setDocument(document);
                    created.setSharedBy(sharedBy);
                    created.setSharedAt(LocalDateTime.now());
                    return created;
                });
        projectDocument.setPinned(true);
        if (projectDocument.getProjectCollection() == null) {
            projectDocument.setProjectCollection(link);
        }
        projectDocumentRepository.save(projectDocument);
    }

    @Transactional
    public void unshare(ProjectDocument projectDocument) {
        Project project = projectDocument.getProject();
        requireCorpusMutable(project);
        if (projectDocument.getProjectCollection() != null) {
            projectDocument.setPinned(false);
            projectDocumentRepository.save(projectDocument);
            return;
        }
        projectDocumentRepository.delete(projectDocument);
    }

    private void syncCollection(ProjectCollection link) {
        collectionSources(link.getCollection().getId())
                .forEach(document -> materialize(link, document));
    }

    private void materialize(ProjectCollection link, Document document) {
        ProjectDocument projectDocument = projectDocumentRepository
                .findByProjectIdAndDocumentId(link.getProject().getId(), document.getId())
                .orElse(null);
        if (projectDocument == null) {
            projectDocument = new ProjectDocument();
            projectDocument.setProject(link.getProject());
            projectDocument.setDocument(document);
            projectDocument.setSharedBy(link.getLinkedBy());
            projectDocument.setSharedAt(LocalDateTime.now());
            projectDocument.setPinned(false);
            projectDocument.setProjectCollection(link);
        } else if (projectDocument.getProjectCollection() == null) {
            projectDocument.setPinned(true);
            projectDocument.setProjectCollection(link);
        }
        projectDocumentRepository.save(projectDocument);
    }

    private void syncCollectionSource(Collection collection, Document document) {
        if (!collection.isActive()) {
            return;
        }
        for (ProjectCollection link : projectCollectionRepository.findByCollectionId(collection.getId())) {
            Project project = link.getProject();
            if (project.isActive() && !isSyncPaused(project)) {
                materialize(link, document);
            }
        }
    }

    private List<Collection> sourceCollections(Document document) {
        Map<UUID, Collection> collections = new LinkedHashMap<>();
        if (document.getCollection() != null && document.getCollection().isActive()) {
            collections.put(document.getCollection().getId(), document.getCollection());
        }
        collectionDocumentRepository.findByDocumentId(document.getId()).stream()
                .map(CollectionDocument::getCollection)
                .filter(Collection::isActive)
                .forEach(collection -> collections.put(collection.getId(), collection));
        return List.copyOf(collections.values());
    }

    private List<Document> collectionSources(UUID collectionId) {
        Map<UUID, Document> documents = new LinkedHashMap<>();
        documentRepository.findByCollectionIdAndDocTypeAndActiveTrue(collectionId, DocumentType.SOURCE)
                .forEach(document -> documents.put(document.getId(), document));
        collectionDocumentRepository.findByCollectionId(collectionId).stream()
                .map(CollectionDocument::getDocument)
                .filter(document -> document.isActive() && document.getDocType() == DocumentType.SOURCE)
                .forEach(document -> documents.put(document.getId(), document));
        return List.copyOf(documents.values());
    }

    private boolean isInCollection(Document document, UUID collectionId) {
        return (document.getCollection() != null
                && Objects.equals(document.getCollection().getId(), collectionId))
                || collectionDocumentRepository.existsByCollectionIdAndDocumentId(
                        collectionId, document.getId());
    }

    private void detachCollectionLink(ProjectCollection removedLink) {
        for (ProjectDocument projectDocument : projectDocumentRepository
                .findByProjectCollectionId(removedLink.getId())) {
            ProjectCollection replacement = replacementLink(projectDocument, removedLink);
            if (replacement != null) {
                projectDocument.setProjectCollection(replacement);
                projectDocumentRepository.save(projectDocument);
            } else {
                detachDerivedShare(projectDocument);
            }
        }
    }

    private void detachCollectionSource(Collection collection, Document document) {
        for (ProjectCollection link : projectCollectionRepository.findByCollectionId(collection.getId())) {
            projectDocumentRepository
                    .findByProjectIdAndDocumentId(link.getProject().getId(), document.getId())
                    .filter(projectDocument -> projectDocument.getProjectCollection() != null)
                    .filter(projectDocument -> Objects.equals(
                            projectDocument.getProjectCollection().getId(), link.getId()))
                    .ifPresent(projectDocument -> {
                        ProjectCollection replacement = replacementLink(projectDocument, link);
                        if (replacement != null) {
                            projectDocument.setProjectCollection(replacement);
                            projectDocumentRepository.save(projectDocument);
                        } else if (isSyncPaused(projectDocument.getProject())) {
                            projectDocument.setPinned(true);
                            projectDocument.setProjectCollection(null);
                            projectDocumentRepository.save(projectDocument);
                        } else {
                            detachDerivedShare(projectDocument);
                        }
                    });
        }
    }

    private ProjectCollection replacementLink(
            ProjectDocument projectDocument, ProjectCollection removedLink) {
        return projectCollectionRepository.findByProjectId(projectDocument.getProject().getId()).stream()
                .filter(link -> !Objects.equals(link.getId(), removedLink.getId()))
                .filter(link -> isInCollection(
                        projectDocument.getDocument(), link.getCollection().getId()))
                .findFirst()
                .orElse(null);
    }

    private void detachDerivedShare(ProjectDocument projectDocument) {
        if (projectDocument.isPinned()) {
            projectDocument.setPinned(true);
            projectDocument.setProjectCollection(null);
            projectDocumentRepository.save(projectDocument);
            return;
        }
        projectDocumentRepository.delete(projectDocument);
    }

    private Project requireActiveProject(UUID projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        if (!project.isActive()) {
            throw new ResourceNotFoundException(projectId, "Project");
        }
        return project;
    }

    private Collection requireActiveCollection(UUID collectionId) {
        Collection collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new ResourceNotFoundException(collectionId, "Collection"));
        if (!collection.isActive()) {
            throw new ResourceNotFoundException(collectionId, "Collection");
        }
        return collection;
    }

    private void requireSyncWriteAccess(User currentUser, Project project) {
        currentUserService.requireProjectWriteAccess(currentUser, project);
        requireCorpusMutable(project);
    }

    private void requireCorpusMutable(Project project) {
        if (isSyncPaused(project)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Project corpus is locked and cannot be modified.");
        }
    }

    private boolean isSyncPaused(Project project) {
        return SYNC_PAUSED_STATUSES.contains(project.getStatus());
    }
}
