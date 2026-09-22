package com.evidencepilot.service;

import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.event.EntityChangedEvent;
import com.evidencepilot.model.Collection;
import com.evidencepilot.model.CollectionDocument;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectCollection;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.CollectionDocumentRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectCollectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.impl.ProjectCollectionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectCollectionServiceTest {

    @Mock
    private ProjectCollectionRepository projectCollectionRepository;
    @Mock
    private ProjectDocumentRepository projectDocumentRepository;
    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private CollectionRepository collectionRepository;
    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private CollectionDocumentRepository collectionDocumentRepository;
    @Mock
    private CurrentUserServiceImpl currentUserService;
    @Mock
    private ApplicationEventPublisher events;

    @Test
    void linkMaterializesEveryCurrentSourceAndIsIdempotent() {
        User instructor = instructor();
        Project project = project(ProjectStatus.CREATED);
        Collection collection = collection(instructor);
        Document source = source(collection);
        ProjectCollection link = link(project, collection, instructor);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(projectCollectionRepository.findByProjectIdAndCollectionId(project.getId(), collection.getId()))
                .thenReturn(Optional.empty(), Optional.of(link));
        when(projectCollectionRepository.save(any(ProjectCollection.class))).thenReturn(link);
        when(documentRepository.findByCollectionIdAndDocTypeAndActiveTrue(
                collection.getId(), DocumentType.SOURCE)).thenReturn(List.of(source));
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), source.getId()))
                .thenReturn(Optional.empty(), Optional.of(projectDocument(project, source, link, false)));

        service().link(project.getId(), collection.getId());
        service().link(project.getId(), collection.getId());

        ArgumentCaptor<ProjectDocument> captor = ArgumentCaptor.forClass(ProjectDocument.class);
        verify(projectDocumentRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        ProjectDocument created = captor.getAllValues().getFirst();
        assertThat(created.getProjectCollection()).isEqualTo(link);
        assertThat(created.isPinned()).isFalse();
        verify(currentUserService, org.mockito.Mockito.times(2))
                .requireCollectionAccess(instructor, collection);
        verify(currentUserService, org.mockito.Mockito.times(2))
                .requireProjectWriteAccess(instructor, project);
        verify(events, times(1)).publishEvent(new EntityChangedEvent(
                "COLLECTION", collection.getId(), "SOURCE_CHANGED", project.getId()));
    }

    @Test
    void linkMaterializesSourcesAttachedFromLibrary() {
        User instructor = instructor();
        Project project = project(ProjectStatus.CREATED);
        Collection originalCollection = collection(instructor);
        Collection targetCollection = collection(instructor);
        Document source = source(originalCollection);
        ProjectCollection link = link(project, targetCollection, instructor);
        CollectionDocument membership = new CollectionDocument();
        membership.setCollection(targetCollection);
        membership.setDocument(source);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(collectionRepository.findById(targetCollection.getId())).thenReturn(Optional.of(targetCollection));
        when(projectCollectionRepository.findByProjectIdAndCollectionId(
                project.getId(), targetCollection.getId())).thenReturn(Optional.empty());
        when(projectCollectionRepository.save(any(ProjectCollection.class))).thenReturn(link);
        when(collectionDocumentRepository.findByCollectionId(targetCollection.getId()))
                .thenReturn(List.of(membership));

        service().link(project.getId(), targetCollection.getId());

        ArgumentCaptor<ProjectDocument> materialized = ArgumentCaptor.forClass(ProjectDocument.class);
        verify(projectDocumentRepository).save(materialized.capture());
        assertThat(materialized.getValue().getDocument()).isEqualTo(source);
        assertThat(materialized.getValue().getProjectCollection()).isEqualTo(link);
    }

    @Test
    void syncSourceUpdatesAllWritableProjectsAndSkipsFrozenProjects() {
        User instructor = instructor();
        Collection collection = collection(instructor);
        Document source = source(collection);
        Project firstWritable = project(ProjectStatus.IN_PROGRESS);
        Project secondWritable = project(ProjectStatus.ASSIGNED);
        Project frozen = project(ProjectStatus.SUBMITTED_FOR_REVIEW);
        ProjectCollection firstWritableLink = link(firstWritable, collection, instructor);
        ProjectCollection secondWritableLink = link(secondWritable, collection, instructor);
        ProjectCollection frozenLink = link(frozen, collection, instructor);
        when(projectCollectionRepository.findByCollectionId(collection.getId()))
                .thenReturn(List.of(firstWritableLink, secondWritableLink, frozenLink));

        service().syncSource(source);

        ArgumentCaptor<ProjectDocument> captor = ArgumentCaptor.forClass(ProjectDocument.class);
        verify(projectDocumentRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        assertThat(captor.getAllValues()).extracting(ProjectDocument::getProject)
                .containsExactly(firstWritable, secondWritable);
        assertThat(captor.getAllValues()).allMatch(projectDocument -> !projectDocument.isPinned());
    }

    @Test
    void syncProjectBackfillsReturnedProjectWithoutChangingItsStatus() {
        User instructor = instructor();
        Project project = project(ProjectStatus.RETURNED);
        Collection collection = collection(instructor);
        Document source = source(collection);
        ProjectCollection link = link(project, collection, instructor);
        when(projectCollectionRepository.findByProjectId(project.getId())).thenReturn(List.of(link));
        when(documentRepository.findByCollectionIdAndDocTypeAndActiveTrue(
                collection.getId(), DocumentType.SOURCE)).thenReturn(List.of(source));

        service().syncProject(project);

        verify(projectDocumentRepository).save(any(ProjectDocument.class));
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.RETURNED);
        verify(projectRepository, never()).save(project);
    }

    @Test
    void linkDoesNotChangeProjectStatus() {
        User instructor = instructor();
        Project project = project(ProjectStatus.CREATED);
        Collection collection = collection(instructor);
        Document source = source(collection);
        ProjectCollection link = link(project, collection, instructor);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(projectCollectionRepository.findByProjectIdAndCollectionId(project.getId(), collection.getId()))
                .thenReturn(Optional.empty());
        when(projectCollectionRepository.save(any(ProjectCollection.class))).thenReturn(link);
        when(documentRepository.findByCollectionIdAndDocTypeAndActiveTrue(
                collection.getId(), DocumentType.SOURCE)).thenReturn(List.of(source));
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), source.getId()))
                .thenReturn(Optional.empty());

        service().link(project.getId(), collection.getId());

        assertThat(project.getStatus()).isEqualTo(ProjectStatus.CREATED);
        verify(projectRepository, never()).save(project);
    }

    @Test
    void unlinkPinsPinnedSourceInsteadOfRemovingIt() {
        User instructor = instructor();
        Project project = project(ProjectStatus.IN_PROGRESS);
        Collection collection = collection(instructor);
        Document source = source(collection);
        ProjectCollection link = link(project, collection, instructor);
        ProjectDocument projectDocument = projectDocument(project, source, link, true);
        stubAuthorizedLink(instructor, project, collection, link);
        when(projectDocumentRepository.findByProjectCollectionId(link.getId()))
                .thenReturn(List.of(projectDocument));

        service().unlink(project.getId(), collection.getId());

        assertThat(projectDocument.isPinned()).isTrue();
        assertThat(projectDocument.getProjectCollection()).isNull();
        verify(projectDocumentRepository).save(projectDocument);
        verify(projectDocumentRepository, never()).delete(projectDocument);
        verify(projectCollectionRepository).delete(link);
        verify(events).publishEvent(new EntityChangedEvent(
                "COLLECTION", collection.getId(), "SOURCE_CHANGED", project.getId()));
    }

    @Test
    void unlinkRemovesDerivedSource() {
        User instructor = instructor();
        Project project = project(ProjectStatus.IN_PROGRESS);
        Collection collection = collection(instructor);
        Document source = source(collection);
        ProjectCollection link = link(project, collection, instructor);
        ProjectDocument projectDocument = projectDocument(project, source, link, false);
        stubAuthorizedLink(instructor, project, collection, link);
        when(projectDocumentRepository.findByProjectCollectionId(link.getId()))
                .thenReturn(List.of(projectDocument));

        service().unlink(project.getId(), collection.getId());

        verify(projectDocumentRepository).delete(projectDocument);
    }

    @Test
    void unlinkKeepsSourceThroughAnotherLinkedCollection() {
        User instructor = instructor();
        Project project = project(ProjectStatus.IN_PROGRESS);
        Collection originalCollection = collection(instructor);
        Collection secondCollection = collection(instructor);
        Document source = source(originalCollection);
        ProjectCollection originalLink = link(project, originalCollection, instructor);
        ProjectCollection secondLink = link(project, secondCollection, instructor);
        ProjectDocument projectDocument = projectDocument(project, source, originalLink, false);
        stubAuthorizedLink(instructor, project, originalCollection, originalLink);
        when(projectDocumentRepository.findByProjectCollectionId(originalLink.getId()))
                .thenReturn(List.of(projectDocument));
        when(projectCollectionRepository.findByProjectId(project.getId()))
                .thenReturn(List.of(originalLink, secondLink));
        when(collectionDocumentRepository.existsByCollectionIdAndDocumentId(
                secondCollection.getId(), source.getId())).thenReturn(true);

        service().unlink(project.getId(), originalCollection.getId());

        assertThat(projectDocument.getProjectCollection()).isEqualTo(secondLink);
        verify(projectDocumentRepository).save(projectDocument);
        verify(projectDocumentRepository, never()).delete(projectDocument);
    }

    @Test
    void removingOriginalSourceDetachesItButKeepsItInLibrary() {
        User instructor = instructor();
        Collection collection = collection(instructor);
        Document source = source(collection);
        when(projectCollectionRepository.findByCollectionId(collection.getId()))
                .thenReturn(List.of());

        service().removeSource(source, collection);

        assertThat(source.getCollection()).isNull();
        assertThat(source.isActive()).isTrue();
        verify(documentRepository).save(source);
        verify(collectionDocumentRepository, never())
                .findByCollectionIdAndDocumentId(collection.getId(), source.getId());
    }

    @Test
    void removingLibraryReferenceRemovesItsDerivedProjectShare() {
        User instructor = instructor();
        Project project = project(ProjectStatus.IN_PROGRESS);
        Collection originalCollection = collection(instructor);
        Collection targetCollection = collection(instructor);
        Document source = source(originalCollection);
        ProjectCollection targetLink = link(project, targetCollection, instructor);
        ProjectDocument projectDocument = projectDocument(project, source, targetLink, false);
        CollectionDocument membership = new CollectionDocument();
        membership.setCollection(targetCollection);
        membership.setDocument(source);
        when(collectionDocumentRepository.findByCollectionIdAndDocumentId(
                targetCollection.getId(), source.getId())).thenReturn(Optional.of(membership));
        when(projectCollectionRepository.findByCollectionId(targetCollection.getId()))
                .thenReturn(List.of(targetLink));
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), source.getId()))
                .thenReturn(Optional.of(projectDocument));
        when(projectCollectionRepository.findByProjectId(project.getId()))
                .thenReturn(List.of(targetLink));

        service().removeSource(source, targetCollection);

        verify(collectionDocumentRepository).delete(membership);
        verify(projectDocumentRepository).delete(projectDocument);
    }

    @Test
    void removingLibraryReferencePreservesSourceInFrozenProject() {
        User instructor = instructor();
        Project project = project(ProjectStatus.APPROVED);
        Collection originalCollection = collection(instructor);
        Collection targetCollection = collection(instructor);
        Document source = source(originalCollection);
        ProjectCollection targetLink = link(project, targetCollection, instructor);
        ProjectDocument projectDocument = projectDocument(project, source, targetLink, false);
        CollectionDocument membership = new CollectionDocument();
        membership.setCollection(targetCollection);
        membership.setDocument(source);
        when(collectionDocumentRepository.findByCollectionIdAndDocumentId(
                targetCollection.getId(), source.getId())).thenReturn(Optional.of(membership));
        when(projectCollectionRepository.findByCollectionId(targetCollection.getId()))
                .thenReturn(List.of(targetLink));
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), source.getId()))
                .thenReturn(Optional.of(projectDocument));
        when(projectCollectionRepository.findByProjectId(project.getId()))
                .thenReturn(List.of(targetLink));

        service().removeSource(source, targetCollection);

        assertThat(projectDocument.isPinned()).isTrue();
        assertThat(projectDocument.getProjectCollection()).isNull();
        verify(projectDocumentRepository).save(projectDocument);
        verify(projectDocumentRepository, never()).delete(projectDocument);
    }

    @Test
    void deletingCollectionPreservesSharedSourcesAsPinnedStandaloneDocuments() {
        User instructor = instructor();
        Project project = project(ProjectStatus.APPROVED);
        Collection collection = collection(instructor);
        Document source = source(collection);
        ProjectCollection link = link(project, collection, instructor);
        ProjectDocument projectDocument = projectDocument(project, source, link, false);
        when(projectCollectionRepository.findByCollectionId(collection.getId())).thenReturn(List.of(link));
        when(projectDocumentRepository.findByProjectCollectionId(link.getId()))
                .thenReturn(List.of(projectDocument));
        when(documentRepository.findByCollectionIdAndDocTypeAndActiveTrue(
                collection.getId(), DocumentType.SOURCE)).thenReturn(List.of(source));
        when(projectDocumentRepository.existsByDocumentId(source.getId())).thenReturn(true);

        service().prepareCollectionDeletion(collection);

        assertThat(projectDocument.isPinned()).isTrue();
        assertThat(projectDocument.getProjectCollection()).isNull();
        assertThat(source.getCollection()).isNull();
        verify(projectCollectionRepository).deleteAll(List.of(link));
        verify(documentRepository).saveAll(List.of(source));
    }

    @Test
    void manualSharePinsInheritedSourceAndManualUnshareOnlyClearsPin() {
        User instructor = instructor();
        Project project = project(ProjectStatus.IN_PROGRESS);
        Collection collection = collection(instructor);
        Document source = source(collection);
        ProjectCollection link = link(project, collection, instructor);
        ProjectDocument projectDocument = projectDocument(project, source, link, false);
        when(projectCollectionRepository.findByProjectIdAndCollectionId(project.getId(), collection.getId()))
                .thenReturn(Optional.of(link));
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), source.getId()))
                .thenReturn(Optional.of(projectDocument));

        service().pinSource(project, source, instructor);
        assertThat(projectDocument.isPinned()).isTrue();

        service().unshare(projectDocument);
        assertThat(projectDocument.isPinned()).isFalse();
        assertThat(projectDocument.getProjectCollection()).isEqualTo(link);
        verify(projectDocumentRepository, never()).delete(projectDocument);
        verify(events, times(2)).publishEvent(new EntityChangedEvent(
                "PROJECT", project.getId(), "SOURCE_CHANGED", null));
    }

    @Test
    void pinningAlreadyPinnedSourceDoesNotPublishEvent() {
        User instructor = instructor();
        Project project = project(ProjectStatus.IN_PROGRESS);
        Collection collection = collection(instructor);
        Document source = source(collection);
        ProjectCollection link = link(project, collection, instructor);
        ProjectDocument projectDocument = projectDocument(project, source, link, true);
        when(projectCollectionRepository.findByProjectIdAndCollectionId(project.getId(), collection.getId()))
                .thenReturn(Optional.of(link));
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), source.getId()))
                .thenReturn(Optional.of(projectDocument));

        service().pinSource(project, source, instructor);

        verify(projectDocumentRepository, never()).save(projectDocument);
        verify(events, never()).publishEvent(any(EntityChangedEvent.class));
    }

    @Test
    void addingSourceCreatesReferenceWithoutChangingOriginalCollection() {
        User instructor = instructor();
        Collection oldCollection = collection(instructor);
        Collection newCollection = collection(instructor);
        Document source = source(oldCollection);

        service().addSource(source, newCollection, instructor);

        ArgumentCaptor<CollectionDocument> membership = ArgumentCaptor.forClass(CollectionDocument.class);
        verify(collectionDocumentRepository).save(membership.capture());
        assertThat(membership.getValue().getDocument()).isEqualTo(source);
        assertThat(membership.getValue().getCollection()).isEqualTo(newCollection);
        assertThat(membership.getValue().getAddedBy()).isEqualTo(instructor);
        assertThat(source.getCollection()).isEqualTo(oldCollection);
        verify(projectCollectionRepository).findByCollectionId(newCollection.getId());
        verify(events).publishEvent(new EntityChangedEvent(
                "COLLECTION", newCollection.getId(), "SOURCE_CHANGED", null));
    }

    @Test
    void frozenProjectRejectsLinkEvenForAuthorizedCaller() {
        User instructor = instructor();
        Project project = project(ProjectStatus.SUBMITTED_FOR_REVIEW);
        Collection collection = collection(instructor);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));

        assertThatThrownBy(() -> service().link(project.getId(), collection.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("corpus is locked");
        verify(projectCollectionRepository, never()).save(any(ProjectCollection.class));
    }

    private void stubAuthorizedLink(User user, Project project, Collection collection, ProjectCollection link) {
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(projectCollectionRepository.findByProjectIdAndCollectionId(project.getId(), collection.getId()))
                .thenReturn(Optional.of(link));
    }

    private ProjectCollectionService service() {
        return new ProjectCollectionService(
                projectCollectionRepository,
                projectDocumentRepository,
                projectRepository,
                collectionRepository,
                documentRepository,
                collectionDocumentRepository,
                currentUserService,
                events);
    }

    private User instructor() {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(UserRole.INSTRUCTOR);
        user.setEmail(user.getId() + "@example.com");
        return user;
    }

    private Project project(ProjectStatus status) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Project");
        project.setStatus(status);
        project.setActive(true);
        return project;
    }

    private Collection collection(User instructor) {
        Collection collection = new Collection();
        collection.setId(UUID.randomUUID());
        collection.setInstructor(instructor);
        collection.setTitle("Collection");
        collection.setActive(true);
        return collection;
    }

    private Document source(Collection collection) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setCollection(collection);
        document.setDocType(DocumentType.SOURCE);
        document.setActive(true);
        return document;
    }

    private ProjectCollection link(Project project, Collection collection, User user) {
        ProjectCollection link = new ProjectCollection();
        link.setId(UUID.randomUUID());
        link.setProject(project);
        link.setCollection(collection);
        link.setLinkedBy(user);
        return link;
    }

    private ProjectDocument projectDocument(
            Project project, Document source, ProjectCollection link, boolean pinned) {
        ProjectDocument projectDocument = new ProjectDocument();
        projectDocument.setId(UUID.randomUUID());
        projectDocument.setProject(project);
        projectDocument.setDocument(source);
        projectDocument.setProjectCollection(link);
        projectDocument.setPinned(pinned);
        return projectDocument;
    }
}
