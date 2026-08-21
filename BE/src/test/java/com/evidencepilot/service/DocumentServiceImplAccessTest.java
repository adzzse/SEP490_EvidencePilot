package com.evidencepilot.service;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentText;
import com.evidencepilot.model.CollectionDocument;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.CollectionDocumentRepository;
import com.evidencepilot.repository.DocumentChunkRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.DocumentTextRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.impl.DocumentPersistenceService;
import com.evidencepilot.service.impl.DocumentServiceImpl;
import com.evidencepilot.service.impl.ProjectCollectionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DocumentServiceImplAccessTest {

    @Mock
    private DocumentRepository documentRepository;

    @Mock
    private DocumentChunkRepository documentChunkRepository;

    @Mock
    private DocumentTextRepository documentTextRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private CollectionRepository collectionRepository;

    @Mock
    private CollectionDocumentRepository collectionDocumentRepository;

    @Mock
    private ProjectDocumentRepository projectDocumentRepository;

    @Mock
    private PaperSectionRepository paperSectionRepository;

    @Mock
    private CurrentUserService currentUserService;

    @Mock
    private ProjectCollectionService projectCollectionService;

    @Mock
    private DocumentPersistenceService documentPersistenceService;


    @Mock
    private DocumentObjectStorage documentObjectStorage;

    @Mock
    private MediaAssetService mediaAssetService;

    @Mock
    private QdrantService qdrantService;

    @Mock
    private com.evidencepilot.client.openalex.OpenAlexClient openAlexClient;

    @Test
    void getDocumentByIdRequiresProjectAccess() {
        User user = user();
        Project project = project();
        project.setStatus(ProjectStatus.ARCHIVED);
        Document document = document(project);

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(document.getId())).thenReturn(Optional.of(document));

        service().getDocumentById(document.getId());

        verify(currentUserService).requireProjectAccess(user, project);
    }

    @Test
    void getDocumentChunksRequiresProjectAccess() {
        User user = user();
        Project project = project();
        Document document = document(project);

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(document.getId())).thenReturn(Optional.of(document));
        when(documentChunkRepository.findByDocumentIdOrderByChunkIndexAsc(document.getId()))
                .thenReturn(List.of());

        service().getDocumentChunks(document.getId());

        verify(currentUserService).requireProjectAccess(user, project);
    }

    @Test
    void deleteDocumentRequiresProjectWriteAccess() {
        User user = user();
        Project project = project();
        Document document = document(project);

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(document.getId())).thenReturn(Optional.of(document));

        service().deleteDocument(document.getId());

        verify(currentUserService).requireProjectWriteAccess(user, project);
    }

    @Test
    void deleteDocumentPropagatesSourceRemovalConflict() {
        User user = user();
        Project project = project();
        Document source = document(project);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        doThrow(new ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT,
                "Project corpus is locked and cannot be modified."))
                .when(projectCollectionService).removeSource(source);

        assertThatThrownBy(() -> service().deleteDocument(source.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("corpus is locked");
        verify(documentRepository, never()).save(source);
    }

    @Test
    void uploadDocumentRequiresProjectWriteAccess() throws Exception {
        User user = user();
        Project project = project();
        Document persisted = document(project);
        persisted.setId(UUID.randomUUID());
        MockMultipartFile file = new MockMultipartFile(
                "file", "paper.pdf", "application/pdf", "content".getBytes());

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(documentPersistenceService.savePendingDocument(
                eq(project), any(), eq(user), eq(DocumentType.PAPER),
                eq("paper.pdf"), eq("application/pdf"), eq(7L)))
                .thenReturn(persisted);
        when(documentPersistenceService.markDocumentAsUploaded(
                eq(persisted.getId()), anyString(), eq("file-hash")))
                .thenReturn(persisted);
        when(documentObjectStorage.writeWithSha256(anyString(), any(), eq(7L), eq("application/pdf")))
                .thenReturn("file-hash");

        service().uploadDocument(project.getId(), file, DocumentType.PAPER);

        verify(currentUserService).requireProjectWriteAccess(user, project);
    }

    @Test
    void uploadDocumentToCollectionTriggersFutureSourceSync() throws Exception {
        User user = user();
        com.evidencepilot.model.Collection collection = collection();
        Document persisted = document(null);
        persisted.setCollection(collection);
        persisted.setDocType(DocumentType.SOURCE);
        MockMultipartFile file = new MockMultipartFile(
                "file", "source.pdf", "application/pdf", "content".getBytes());

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(documentPersistenceService.savePendingDocument(
                any(), eq(collection), eq(user), eq(DocumentType.SOURCE),
                eq("source.pdf"), eq("application/pdf"), eq(7L)))
                .thenReturn(persisted);
        when(documentPersistenceService.markDocumentAsUploaded(
                eq(persisted.getId()), anyString(), eq("file-hash")))
                .thenReturn(persisted);
        when(documentObjectStorage.writeWithSha256(anyString(), any(), eq(7L), eq("application/pdf")))
                .thenReturn("file-hash");

        service().uploadDocument(null, collection.getId(), file, DocumentType.SOURCE);

        verify(projectCollectionService).syncSource(persisted);
    }

    @Test
    void addSourceToCollectionCreatesReferenceAfterWriteAccessCheck() {
        User user = user();
        com.evidencepilot.model.Collection collection = collection();
        Document source = document(null);
        source.setDocType(DocumentType.SOURCE);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(projectCollectionService.addSource(source, collection, user)).thenReturn(source);

        service().addSourceToCollection(collection.getId(), source.getId());

        verify(currentUserService).requireUserIdOrAdmin(user, source.getUploadedBy().getId());
        verify(projectCollectionService).addSource(source, collection, user);
    }

    @Test
    void removeSourceFromCollectionDelegatesReferenceRemoval() {
        User user = user();
        com.evidencepilot.model.Collection targetCollection = collection();
        Document source = document(null);
        source.setDocType(DocumentType.SOURCE);
        source.setCollection(collection());
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(collectionRepository.findById(targetCollection.getId()))
                .thenReturn(Optional.of(targetCollection));
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));

        service().removeSourceFromCollection(targetCollection.getId(), source.getId());

        verify(currentUserService).requireCollectionAccess(user, targetCollection);
        verify(projectCollectionService).removeSource(source, targetCollection);
    }

    @Test
    void removeSourceFromOriginalCollectionKeepsDocumentInLibrary() {
        User user = user();
        com.evidencepilot.model.Collection collection = collection();
        Document source = document(null);
        source.setDocType(DocumentType.SOURCE);
        source.setCollection(collection);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));

        service().removeSourceFromCollection(collection.getId(), source.getId());

        verify(currentUserService).requireCollectionAccess(user, collection);
        verify(projectCollectionService).removeSource(source, collection);
    }

    @Test
    void uploadDocumentKeepsProjectStatusAndSyncsSource() throws Exception {
        User user = user();
        Project project = project();
        project.setStatus(ProjectStatus.ASSIGNED);
        Document persisted = document(project);
        persisted.setId(UUID.randomUUID());
        MockMultipartFile file = new MockMultipartFile(
                "file", "paper.pdf", "application/pdf", "content".getBytes());

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(documentPersistenceService.savePendingDocument(
                eq(project), any(), eq(user), eq(DocumentType.PAPER),
                eq("paper.pdf"), eq("application/pdf"), eq(7L)))
                .thenReturn(persisted);
        when(documentPersistenceService.markDocumentAsUploaded(
                eq(persisted.getId()), anyString(), eq("file-hash")))
                .thenReturn(persisted);
        when(documentObjectStorage.writeWithSha256(anyString(), any(), eq(7L), eq("application/pdf")))
                .thenReturn("file-hash");
        service().uploadDocument(project.getId(), file, DocumentType.PAPER);

        verify(projectCollectionService).syncSource(persisted);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ASSIGNED);
        verify(projectRepository, never()).save(project);
    }

    @Test
    void deleteDocumentKeepsProjectStatus() {
        User user = user();
        Project project = project();
        project.setStatus(ProjectStatus.IN_PROGRESS);
        Document source = document(project);
        source.setDocType(DocumentType.SOURCE);
        source.setFileHashSha256("file-hash");

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        service().deleteDocument(source.getId());

        verify(projectCollectionService).removeSource(source);
        verify(mediaAssetService).deleteExtractedForDocument(source);
        verify(documentObjectStorage).deleteExtractionCheckpoint(source.getId(), "file-hash");
        verify(qdrantService).deleteVectors(source.getId());
        assertThat(source.isActive()).isFalse();
        assertThat(source.getDownloadToken()).isNotBlank();
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.IN_PROGRESS);
        verify(projectRepository, never()).save(project);
    }

    @Test
    void reExtractInvalidatesDerivedDataBeforeQueueing() {
        User user = user();
        Document source = document(project());
        source.setProcessingStatus(ProcessingStatus.READY);
        source.setFileHashSha256("file-hash");
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(documentPersistenceService.markDocumentAsUploaded(
                source.getId(), source.getFileUrl(), "file-hash")).thenReturn(source);

        service().reExtract(source.getId());

        verify(documentObjectStorage).deleteExtractionCheckpoint(source.getId(), "file-hash");
        verify(mediaAssetService).deleteExtractedForDocument(source);
        verify(qdrantService).deleteVectors(source.getId());
        verify(documentPersistenceService).markDocumentAsUploaded(
                source.getId(), source.getFileUrl(), "file-hash");
    }

    @Test
    void downloadTokenCannotReadSoftDeletedDocument() {
        Document source = document(project());
        source.setActive(false);
        source.setDownloadToken("token");
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));

        assertThatThrownBy(() -> service().getDocumentForDownload(source.getId(), "token"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    @Test
    void uploadDeletesObjectWhenMetadataUpdateFails() throws Exception {
        User user = user();
        Project project = project();
        Document pending = document(project);
        MockMultipartFile file = new MockMultipartFile(
                "file", "paper.pdf", "application/pdf", "content".getBytes());
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(documentPersistenceService.savePendingDocument(
                eq(project), any(), eq(user), eq(DocumentType.PAPER),
                eq("paper.pdf"), eq("application/pdf"), eq(7L))).thenReturn(pending);
        when(documentObjectStorage.writeWithSha256(anyString(), any(), eq(7L), eq("application/pdf")))
                .thenReturn("file-hash");
        when(documentPersistenceService.markDocumentAsUploaded(
                pending.getId(), "sources/raw/" + pending.getId() + ".pdf", "file-hash"))
                .thenThrow(new RuntimeException("db offline"));

        assertThatThrownBy(() -> service().uploadDocument(project.getId(), file, DocumentType.PAPER))
                .hasMessageContaining("db offline");

        verify(documentObjectStorage).delete("sources/raw/" + pending.getId() + ".pdf");
        verify(documentPersistenceService).markFailed(pending.getId(), "File metadata update failed");
    }

    @Test
    void uploadDocumentRejectsCompletedProject() {
        User user = user();
        Project project = project();
        project.setStatus(ProjectStatus.APPROVED);
        MockMultipartFile file = new MockMultipartFile(
                "file", "paper.pdf", "application/pdf", "content".getBytes());

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        doThrow(readOnly()).when(currentUserService).requireProjectWriteAccess(user, project);

        assertThatThrownBy(() -> service().uploadDocument(project.getId(), file, DocumentType.PAPER))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Project is read-only.");
        verify(documentRepository, never()).save(any(Document.class));
    }

    @Test
    void deleteDocumentRejectsArchivedProject() {
        User user = user();
        Project project = project();
        project.setStatus(ProjectStatus.ARCHIVED);
        Document document = document(project);

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(document.getId())).thenReturn(Optional.of(document));
        doThrow(readOnly()).when(currentUserService).requireProjectWriteAccess(user, project);

        assertThatThrownBy(() -> service().deleteDocument(document.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Project is read-only.");
        verify(documentRepository, never()).save(any(Document.class));
    }

    @Test
    void archivedProjectRejectsShareAndRemoveSharedDocument() {
        User user = user();
        Project project = project();
        project.setStatus(ProjectStatus.ARCHIVED);
        com.evidencepilot.model.Collection collection = collection();
        Document source = document(null);
        source.setDocType(DocumentType.SOURCE);
        source.setCollection(collection);
        source.setProcessingStatus(ProcessingStatus.READY);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        doThrow(readOnly()).when(currentUserService).requireProjectWriteAccess(user, project);

        assertThatThrownBy(() -> service().shareToProject(collection.getId(), source.getId(), project.getId()))
                .hasMessageContaining("Project is read-only.");
        assertThatThrownBy(() -> service().removeSharedDocument(project.getId(), source.getId()))
                .hasMessageContaining("Project is read-only.");
        verify(projectDocumentRepository, never()).save(any());
        verify(projectDocumentRepository, never()).delete(any());
    }

    @Test
    void shareToProjectRejectsSourceFromAnotherCollection() {
        User user = user();
        com.evidencepilot.model.Collection requestedCollection = collection();
        com.evidencepilot.model.Collection actualCollection = collection();
        Document source = document(null);
        source.setDocType(DocumentType.SOURCE);
        source.setCollection(actualCollection);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(collectionRepository.findById(requestedCollection.getId()))
                .thenReturn(Optional.of(requestedCollection));
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));

        assertThatThrownBy(() -> service().shareToProject(
                requestedCollection.getId(), source.getId(), UUID.randomUUID()))
                .isInstanceOf(com.evidencepilot.exception.ResourceNotFoundException.class)
                .hasMessageContaining("Source in collection");
        verify(projectCollectionService, never()).pinSource(any(), any(), any());
    }

    @Test
    void shareToProjectRejectsSourceNotReady() {
        User user = user();
        com.evidencepilot.model.Collection collection = collection();
        Project project = project();
        Document source = document(null);
        source.setDocType(DocumentType.SOURCE);
        source.setCollection(collection);
        source.setProcessingStatus(ProcessingStatus.PROCESSING);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));

        assertThatThrownBy(() -> service().shareToProject(
                collection.getId(), source.getId(), project.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(409))
                .hasMessageContaining("not ready to share");
        verify(projectCollectionService, never()).pinSource(any(), any(), any());
        verify(projectDocumentRepository, never()).save(any());
    }

    @Test
    void shareToProjectReadySourcePinsSource() {
        User user = user();
        com.evidencepilot.model.Collection collection = collection();
        Project project = project();
        Document source = document(null);
        source.setDocType(DocumentType.SOURCE);
        source.setCollection(collection);
        source.setProcessingStatus(ProcessingStatus.READY);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));

        service().shareToProject(collection.getId(), source.getId(), project.getId());
        service().shareToProject(collection.getId(), source.getId(), project.getId());

        verify(projectCollectionService, times(2)).pinSource(project, source, collection, user);
    }

    @Test
    void archivedProjectRejectsExtractionAffectingFileAttachment() {
        User user = user();
        Project project = project();
        project.setStatus(ProjectStatus.ARCHIVED);
        Document document = document(project);
        document.setProcessingStatus(ProcessingStatus.METADATA_FETCHED);
        MockMultipartFile file = new MockMultipartFile(
                "file", "paper.pdf", "application/pdf", "content".getBytes());

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(document.getId())).thenReturn(Optional.of(document));
        doThrow(readOnly()).when(currentUserService).requireProjectWriteAccess(user, project);

        assertThatThrownBy(() -> service().attachFileToDocument(document.getId(), file))
                .hasMessageContaining("Project is read-only.");
        verify(documentPersistenceService, never()).markDocumentAsUploaded(any(), anyString(), any());
    }

    @Test
    void submittedProjectLocksLinkedDocumentMutationForNonAdmin() {
        User user = user();
        Project project = project();
        project.setStatus(ProjectStatus.SUBMITTED_FOR_REVIEW);
        com.evidencepilot.model.Collection collection = collection();
        Document source = document(null);
        source.setCollection(collection);
        com.evidencepilot.model.ProjectDocument link = new com.evidencepilot.model.ProjectDocument();
        link.setProject(project);
        link.setDocument(source);

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(projectDocumentRepository.findByDocumentId(source.getId())).thenReturn(List.of(link));

        assertThatThrownBy(() -> service().deleteDocument(source.getId()))
                .hasMessageContaining("Project is locked and cannot be modified.");
        verify(documentRepository, never()).save(source);
    }

    @Test
    void submittedProjectLocksLinkedDocumentMutationForAdmin() {
        User admin = user();
        Project project = project();
        project.setStatus(ProjectStatus.SUBMITTED_FOR_REVIEW);
        Document source = document(null);
        com.evidencepilot.model.ProjectDocument link = new com.evidencepilot.model.ProjectDocument();
        link.setProject(project);
        link.setDocument(source);

        when(currentUserService.requireCurrentUser()).thenReturn(admin);
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(projectDocumentRepository.findByDocumentId(source.getId())).thenReturn(List.of(link));

        assertThatThrownBy(() -> service().deleteDocument(source.getId()))
                .hasMessageContaining("Project is locked and cannot be modified.");

        verify(documentRepository, never()).save(source);
    }

    @Test
    void getSourceByIdRequiresAccessAndSourceType() {
        User user = user();
        Project project = project();
        Document source = document(project);
        source.setDocType(DocumentType.SOURCE);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));

        assertThat(service().getSourceById(source.getId()).id()).isEqualTo(source.getId());

        verify(currentUserService).requireProjectAccess(user, project);
    }

    @Test
    void getAllPapersForCurrentUserFiltersInactiveAndSourceDocuments() {
        User admin = user();
        Document paper = document(null);
        Document source = document(null);
        source.setDocType(DocumentType.SOURCE);
        Document inactive = document(null);
        inactive.setActive(false);
        when(currentUserService.requireCurrentUser()).thenReturn(admin);
        when(currentUserService.isAdmin(admin)).thenReturn(true);
        when(documentRepository.findAll()).thenReturn(List.of(paper, source, inactive));

        assertThat(service().getAllPapersForCurrentUser()).singleElement()
                .extracting("id").isEqualTo(paper.getId());
    }

    @Test
    void projectDocumentQueriesRequireAccessAndReturnPagedResults() {
        User user = user();
        Project project = project();
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(documentRepository.findByProjectId(project.getId())).thenReturn(List.of());
        when(documentRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        assertThat(service().getDocumentsByProject(project.getId())).isEmpty();
        assertThat(service().getDocumentsByProject(
                project.getId(), 0, 20, "createdAt,desc", null, null, null, true).content()).isEmpty();
        assertThat(service().getSourcesByProject(
                project.getId(), 0, 20, "createdAt,desc", null, ProcessingStatus.READY, true).content()).isEmpty();
        verify(currentUserService, times(3)).requireProjectAccess(user, project);
    }

    @Test
    void sourcePagingMergesDirectAndSharedDocumentsBeforePaging() {
        User user = user();
        Project project = project();
        Document direct = document(project);
        direct.setDocType(DocumentType.SOURCE);
        direct.setOriginalFilename("b.pdf");
        Document shared = document(null);
        shared.setDocType(DocumentType.SOURCE);
        shared.setOriginalFilename("a.pdf");
        ProjectDocument projectDocument = new ProjectDocument();
        projectDocument.setProject(project);
        projectDocument.setDocument(shared);

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(documentRepository.findAll(any(Specification.class))).thenReturn(List.of(direct));
        when(projectDocumentRepository.findByProjectId(project.getId()))
                .thenReturn(List.of(projectDocument));

        var first = service().getSourcesByProject(
                project.getId(), 0, 1, "originalFilename,asc", null, null, true);
        var second = service().getSourcesByProject(
                project.getId(), 1, 1, "originalFilename,asc", null, null, true);

        assertThat(first.content()).singleElement()
                .extracting(response -> response.originalFilename())
                .isEqualTo("a.pdf");
        assertThat(first.totalElements()).isEqualTo(2);
        assertThat(first.last()).isFalse();
        assertThat(second.content()).singleElement()
                .extracting(response -> response.originalFilename())
                .isEqualTo("b.pdf");
        assertThat(second.last()).isTrue();
    }

    @Test
    void getSourcesByCollectionEnrichesSharedProjectIds() {
        User user = user();
        com.evidencepilot.model.Collection collection = collection();
        Document source = document(null);
        source.setDocType(DocumentType.SOURCE);
        source.setOriginalFilename("evidence.pdf");
        Project targetProject = project();
        targetProject.setTitle("Capstone A");
        ProjectDocument projectDocument = new ProjectDocument();
        projectDocument.setProject(targetProject);
        projectDocument.setDocument(source);

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(documentRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(source)));
        when(projectDocumentRepository.findByDocumentId(source.getId()))
                .thenReturn(List.of(projectDocument));

        var page = service().getSourcesByCollection(
                collection.getId(), 0, 10, "createdAt,desc", null);

        assertThat(page.content()).singleElement()
                .extracting(response -> response.projectIds())
                .isEqualTo(List.of(targetProject.getId()));
        verify(currentUserService).requireCollectionAccess(user, collection);
    }

    @Test
    void sourceLibraryReturnsOwnedSourcesWithCollectionAndProjectUsage() {
        User user = user();
        com.evidencepilot.model.Collection homeCollection = collection();
        homeCollection.setTitle("Research library");
        com.evidencepilot.model.Collection reusedCollection = collection();
        reusedCollection.setTitle("Capstone references");
        Project project = project();
        project.setTitle("Capstone A");

        Document source = document(null);
        source.setUploadedBy(user);
        source.setDocType(DocumentType.SOURCE);
        source.setTitle("Evidence synthesis");
        source.setOriginalFilename("evidence.pdf");
        source.setCollection(homeCollection);

        CollectionDocument collectionLink = new CollectionDocument();
        collectionLink.setCollection(reusedCollection);
        collectionLink.setDocument(source);
        ProjectDocument projectLink = new ProjectDocument();
        projectLink.setProject(project);
        projectLink.setDocument(source);

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(source)));
        when(collectionDocumentRepository.findByDocumentId(source.getId()))
                .thenReturn(List.of(collectionLink));
        when(projectDocumentRepository.findByDocumentId(source.getId()))
                .thenReturn(List.of(projectLink));

        var page = service().getSourceLibrary(
                0, 20, "createdAt,desc", "evidence", ProcessingStatus.READY);

        assertThat(page.content()).singleElement().satisfies(item -> {
            assertThat(item.title()).isEqualTo("Evidence synthesis");
            assertThat(item.collections()).extracting(usage -> usage.name())
                    .containsExactly("Research library", "Capstone references");
            assertThat(item.projects()).extracting(usage -> usage.name())
                    .containsExactly("Capstone A");
        });
    }

    @Test
    void sourceLibraryOmitsInactiveCollectionAndProjectUsage() {
        User user = user();

        com.evidencepilot.model.Collection deletedHomeCollection = collection();
        deletedHomeCollection.setTitle("Deleted home");
        deletedHomeCollection.setActive(false);
        com.evidencepilot.model.Collection activeCollection = collection();
        activeCollection.setTitle("Active references");
        com.evidencepilot.model.Collection deletedLinkedCollection = collection();
        deletedLinkedCollection.setTitle("Deleted references");
        deletedLinkedCollection.setActive(false);

        Project deletedHomeProject = project();
        deletedHomeProject.setTitle("Deleted project");
        deletedHomeProject.setActive(false);
        Project activeProject = project();
        activeProject.setTitle("Active project");
        Project deletedLinkedProject = project();
        deletedLinkedProject.setTitle("Deleted linked project");
        deletedLinkedProject.setActive(false);

        Document source = document(deletedHomeProject);
        source.setUploadedBy(user);
        source.setDocType(DocumentType.SOURCE);
        source.setCollection(deletedHomeCollection);

        CollectionDocument activeCollectionLink = new CollectionDocument();
        activeCollectionLink.setCollection(activeCollection);
        activeCollectionLink.setDocument(source);
        CollectionDocument deletedCollectionLink = new CollectionDocument();
        deletedCollectionLink.setCollection(deletedLinkedCollection);
        deletedCollectionLink.setDocument(source);
        ProjectDocument activeProjectLink = new ProjectDocument();
        activeProjectLink.setProject(activeProject);
        activeProjectLink.setDocument(source);
        ProjectDocument deletedProjectLink = new ProjectDocument();
        deletedProjectLink.setProject(deletedLinkedProject);
        deletedProjectLink.setDocument(source);

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(source)));
        when(collectionDocumentRepository.findByDocumentId(source.getId()))
                .thenReturn(List.of(activeCollectionLink, deletedCollectionLink));
        when(projectDocumentRepository.findByDocumentId(source.getId()))
                .thenReturn(List.of(activeProjectLink, deletedProjectLink));

        var page = service().getSourceLibrary(
                0, 20, "createdAt,desc", "", ProcessingStatus.READY);

        assertThat(page.content()).singleElement().satisfies(item -> {
            assertThat(item.collections()).extracting(usage -> usage.name())
                    .containsExactly("Active references");
            assertThat(item.projects()).extracting(usage -> usage.name())
                    .containsExactly("Active project");
        });
    }

    @Test
    void updateSourceTrimsTitleAndChecksOwnership() {
        User user = user();
        com.evidencepilot.model.Collection collection = collection();
        Document source = document(null);
        source.setUploadedBy(user);
        source.setDocType(DocumentType.SOURCE);
        source.setCollection(collection);

        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(documentRepository.save(source)).thenReturn(source);

        var updated = service().updateSource(source.getId(), "  Updated title  ");

        assertThat(updated.title()).isEqualTo("Updated title");
        verify(currentUserService).requireUserIdOrAdmin(user, user.getId());
        verify(currentUserService).requireCollectionAccess(user, collection);
    }

    @Test
    void getDocumentTextMapsExistingTextAndRejectsMissingText() {
        User user = user();
        Project project = project();
        Document document = document(project);
        DocumentText text = new DocumentText();
        text.setId(UUID.randomUUID());
        text.setDocument(document);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(documentRepository.findById(document.getId())).thenReturn(Optional.of(document));
        when(documentTextRepository.findByDocumentId(document.getId())).thenReturn(text, null);

        var response = service().getDocumentText(document.getId());
        assertThat(response.id()).isEqualTo(text.getId());
        assertThat(response.documentId()).isEqualTo(document.getId());

        assertThatThrownBy(() -> service().getDocumentText(document.getId()))
                .hasMessageContaining("Document text not found");
    }

    @Test
    void getDiagnosticsSurfacesMetadataOpenAlexFailureAndExtractionCheckpoint() throws Exception {
        Project project = project();
        project.setTitle("Test Project");
        Document document = document(project);
        document.setDoi("10.1000/xyz");
        document.setProcessingStatus(ProcessingStatus.FAILED);
        document.setProcessingError("boom");
        document.setChunkCount(3);
        document.setFileHashSha256("file-hash");
        document.setProcessedAt(java.time.LocalDateTime.of(2026, 1, 1, 12, 0));

        when(documentRepository.findById(document.getId())).thenReturn(Optional.of(document));
        when(openAlexClient.fetchWork("10.1000/xyz"))
                .thenThrow(new com.evidencepilot.client.openalex.OpenAlexClient.OpenAlexApiException("rate limited", 429));
        when(documentObjectStorage.exists(anyString())).thenReturn(true);
        when(documentObjectStorage.readText(anyString())).thenReturn("{\"key\":\"value\"}");

        Map<String, Object> diag = service().getDiagnostics(document.getId());

        assertThat(diag.get("doi")).isEqualTo("10.1000/xyz");
        assertThat(diag.get("processingStatus")).isEqualTo("FAILED");
        assertThat(diag.get("processingError")).isEqualTo("boom");
        assertThat(diag.get("chunkCount")).isEqualTo(3);
        assertThat(diag.get("processedAt")).isEqualTo("2026-01-01T12:00");
        assertThat(diag.get("projectName")).isEqualTo("Test Project");
        assertThat(diag.get("openAlexError")).isEqualTo("rate limited");
        assertThat(diag.get("extractionAvailable")).isEqualTo(true);
        assertThat(diag.get("extractionJson")).isEqualTo(Map.of("key", "value"));
        verify(documentObjectStorage).exists(
                "documents/processed/" + document.getId() + "/file-hash/extraction.json");
    }

    private DocumentServiceImpl service() {
        var service = new DocumentServiceImpl(
                documentRepository,
                documentChunkRepository,
                documentTextRepository,
                projectRepository,
                collectionRepository,
                collectionDocumentRepository,
                projectDocumentRepository,
                paperSectionRepository,
                currentUserService,
                documentPersistenceService,
                documentObjectStorage,
                mediaAssetService,
                qdrantService,
                openAlexClient,
                new com.fasterxml.jackson.databind.ObjectMapper(),
                projectCollectionService);
        return service;
    }

    private ResponseStatusException readOnly() {
        return new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "Project is read-only.");
    }

    private User user() {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(user.getId() + "@example.com");
        return user;
    }

    private Project project() {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        return project;
    }

    private com.evidencepilot.model.Collection collection() {
        com.evidencepilot.model.Collection collection = new com.evidencepilot.model.Collection();
        collection.setId(UUID.randomUUID());
        collection.setActive(true);
        return collection;
    }

    private Document document(Project project) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setProject(project);
        document.setUploadedBy(user());
        document.setDocType(DocumentType.PAPER);
        document.setFileUrl("file");
        document.setActive(true);
        return document;
    }
}
