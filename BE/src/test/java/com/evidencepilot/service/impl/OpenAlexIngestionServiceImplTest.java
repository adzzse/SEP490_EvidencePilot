package com.evidencepilot.service.impl;

import com.evidencepilot.client.openalex.OpenAlexClient;
import com.evidencepilot.dto.openalex.OpenAlexWorkResponse;
import com.evidencepilot.dto.response.OpenAlexPreview;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Collection;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentReference;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.EdgeType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.CollectionDocumentRepository;
import com.evidencepilot.repository.DocumentReferenceRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.DocumentObjectStorage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OpenAlexIngestionServiceImplTest {

    @Mock
    private OpenAlexClient openAlexClient;
    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private CollectionRepository collectionRepository;
    @Mock
    private CollectionDocumentRepository collectionDocumentRepository;
    @Mock
    private CurrentUserService currentUserService;
    @Mock
    private DocumentObjectStorage documentObjectStorage;
    @Mock
    private DocumentPersistenceService documentPersistenceService;
    @Mock
    private DocumentReferenceRepository documentReferenceRepository;
    @Mock
    private ProjectCollectionService projectCollectionService;

    private OpenAlexIngestionServiceImpl service;
    private OpenAlexIngestionServiceImpl serviceSpy;
    private User currentUser;
    private Project project;
    private OpenAlexWorkResponse sampleWork;

    @BeforeEach
    void setUp() {
        service = new OpenAlexIngestionServiceImpl(
                openAlexClient, documentRepository, projectRepository,
                collectionRepository, collectionDocumentRepository, currentUserService, documentObjectStorage,
                documentPersistenceService, documentReferenceRepository, new ObjectMapper(),
                projectCollectionService);
        serviceSpy = spy(service);

        currentUser = new User();
        currentUser.setId(UUID.randomUUID());
        currentUser.setEmail("test@test.com");
        currentUser.setRole(UserRole.STUDENT);

        project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Test Project");
        project.setStatus(ProjectStatus.IN_PROGRESS);
        project.setActive(true);

        sampleWork = new OpenAlexWorkResponse(
                "https://openalex.org/W123",
                "https://doi.org/10.1000/xyz123",
                "Test Paper",
                List.of(new OpenAlexWorkResponse.OpenAlexAuthor(
                        new OpenAlexWorkResponse.Author("Alice Smith"))),
                new OpenAlexWorkResponse.OpenAlexPrimaryLocation(
                        new OpenAlexWorkResponse.OpenAlexSource(
                                "Pub", "Org", "journal", "https://example.com"),
                        "https://example.com/paper.pdf",
                        "https://example.com/paper",
                        "cc-by", "acceptedVersion", true),
                null,
                new OpenAlexWorkResponse.OpenAlexOpenAccess(true, "green", "https://example.com/paper.pdf", true),
                null,
                2024,
                null,
                List.of(),
                null
        );
    }

    @Test
    void lookupByDoi_returnsPreview() {
        when(openAlexClient.fetchWork("10.1000/xyz")).thenReturn(sampleWork);

        OpenAlexPreview preview = service.lookupByDoi("10.1000/xyz");

        assertThat(preview.title()).isEqualTo("Test Paper");
        assertThat(preview.publicationYear()).isEqualTo(2024);
        assertThat(preview.authors()).containsExactly("Alice Smith");
        assertThat(preview.oaUrl()).isEqualTo("https://example.com/paper.pdf");
    }

    @Test
    void ingestByDoi_savesDocumentUploadsPdfAndAppendsReferences() {
        String doi = "10.1000/xyz123";
        UUID projectId = project.getId();
        byte[] pdfBytes = "%PDF-1.7\nmock content\n%%EOF".getBytes();
        String existingReferenceId = "https://openalex.org/W-EXISTING";
        String newReferenceId = "https://openalex.org/W-NEW";
        var workWithReferences = new OpenAlexWorkResponse(
                sampleWork.id(), sampleWork.doi(), sampleWork.title(), sampleWork.authorships(),
                sampleWork.primaryLocation(), sampleWork.bestOaLocation(), sampleWork.openAccess(),
                sampleWork.contentUrls(), sampleWork.publicationYear(), sampleWork.primaryTopic(),
                List.of(existingReferenceId, newReferenceId), sampleWork.citedByCount());
        var resolvedReference = new OpenAlexWorkResponse(
                newReferenceId, "https://doi.org/10.1000/ref", "Referenced Paper",
                List.of(), null, null, null, null, 2022, null, List.of(), 7);
        var existingReference = new DocumentReference();
        existingReference.setRawText(existingReferenceId);
        existingReference.setReferenceIndex(4);
        existingReference.setEdgeType(EdgeType.REFERENCES);

        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(openAlexClient.fetchWork(doi)).thenReturn(workWithReferences);
        when(openAlexClient.downloadPdf("https://example.com/paper.pdf"))
                .thenReturn(new ByteArrayInputStream(pdfBytes));
        when(openAlexClient.fetchWorksByIds(eq(List.of(existingReferenceId, newReferenceId)), anyString()))
                .thenReturn(List.of(resolvedReference));
        when(openAlexClient.fetchCitedByWorks(sampleWork.id(), 5)).thenReturn(List.of());
        when(documentReferenceRepository.findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
                any(), eq(EdgeType.REFERENCES))).thenReturn(List.of(existingReference));
        when(documentRepository.save(any())).thenAnswer(invocation -> {
            var doc = (com.evidencepilot.model.Document) invocation.getArgument(0);
            if (doc.getId() == null) doc.setId(UUID.randomUUID());
            return doc;
        });
        when(documentObjectStorage.writeWithSha256(anyString(), any(byte[].class), eq("application/pdf")))
                .thenReturn("pdf-hash");
        when(documentPersistenceService.markDocumentAsUploaded(any(), anyString(), eq("pdf-hash")))
                .thenAnswer(invocation -> {
                    var id = (UUID) invocation.getArgument(0);
                    var fileUrl = (String) invocation.getArgument(1);
                    var doc = new com.evidencepilot.model.Document();
                    doc.setId(id);
                    doc.setFileUrl(fileUrl);
                    doc.setProcessingStatus(ProcessingStatus.UPLOADED);
                    doc.setProject(project);
                    doc.setDocType(com.evidencepilot.model.enums.DocumentType.SOURCE);
                    doc.setUploadedBy(currentUser);
                    doc.setActive(true);
                    doc.setOriginalFilename("Test Paper.pdf");
                    doc.setDoi(doi);
                    doc.setTitle("Test Paper");
                    doc.setPublicationYear(2024);
                    doc.setPublisher("Test Publisher");
                    doc.setCreatedAt(LocalDateTime.now());
                    return doc;
                });

        var result = serviceSpy.ingestByDoi(projectId, null, doi);

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.UPLOADED);
        assertThat(result.originalFilename()).contains("Test Paper");
        verify(documentObjectStorage).writeWithSha256(anyString(), eq(pdfBytes), eq("application/pdf"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<DocumentReference>> references = ArgumentCaptor.forClass(List.class);
        verify(documentReferenceRepository).saveAll(references.capture());
        assertThat(references.getValue()).singleElement().satisfies(reference -> {
            assertThat(reference.getRawText()).isEqualTo(newReferenceId);
            assertThat(reference.getReferenceIndex()).isEqualTo(5);
            assertThat(reference.getEdgeType()).isEqualTo(EdgeType.REFERENCES);
        });
    }

    @Test
    void ingestByDoi_keepsMetadataOnlyWhenPublisherReturnsHtml() {
        String doi = "10.1000/html-block";
        byte[] htmlBytes = "<!DOCTYPE html><html><body>Checking your browser</body></html>".getBytes();

        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(openAlexClient.fetchWork(doi)).thenReturn(sampleWork);
        when(openAlexClient.downloadPdf("https://example.com/paper.pdf"))
                .thenReturn(new ByteArrayInputStream(htmlBytes));
        when(openAlexClient.fetchCitedByWorks(sampleWork.id(), 5)).thenReturn(List.of());
        when(documentRepository.save(any())).thenAnswer(invocation -> {
            var document = (Document) invocation.getArgument(0);
            if (document.getId() == null) document.setId(UUID.randomUUID());
            return document;
        });

        var result = service.ingestByDoi(project.getId(), null, doi);

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.METADATA_FETCHED);
        assertThat(result.processingError())
                .contains("not a valid PDF")
                .contains("HTML bot-block page");
        assertThat(result.fileSizeBytes()).isZero();
        verify(documentObjectStorage, never()).writeWithSha256(anyString(), any(byte[].class), anyString());
        verify(documentPersistenceService, never()).markDocumentAsUploaded(any(), anyString(), any());
        verify(projectCollectionService).syncSource(any(Document.class));
    }

    @Test
    void ingestByDoi_returnsMetadataOnlyWhenOaUrlIsNull() {
        var workNoPdf = new OpenAlexWorkResponse(
                "https://openalex.org/W456", "https://doi.org/10.1000/no-pdf",
                "No PDF", List.of(), null, null, null, null, 2023, null, List.of(), null);

        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(openAlexClient.fetchWork("10.1000/no-pdf")).thenReturn(workNoPdf);
        when(documentRepository.save(any())).thenAnswer(invocation -> {
            var doc = (com.evidencepilot.model.Document) invocation.getArgument(0);
            if (doc.getId() == null) doc.setId(UUID.randomUUID());
            return doc;
        });

        var result = service.ingestByDoi(project.getId(), null, "10.1000/no-pdf");

        assertThat(result.processingStatus()).isEqualTo(ProcessingStatus.METADATA_FETCHED);
        assertThat(result.processingError()).isEqualTo("No open-access PDF available for this DOI");
        assertThat(result.originalFilename()).contains("No PDF");
    }

    @Test
    void ingestByDoiIntoCollectionTriggersFutureSourceSync() {
        Collection collection = new Collection();
        collection.setId(UUID.randomUUID());
        collection.setActive(true);
        var workNoPdf = new OpenAlexWorkResponse(
                "https://openalex.org/W789", "https://doi.org/10.1000/collection",
                "Collection Source", List.of(), null, null, null, null, 2025, null, List.of(), null);
        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
        when(openAlexClient.fetchWork("10.1000/collection")).thenReturn(workNoPdf);
        when(documentRepository.save(any())).thenAnswer(invocation -> {
            var document = (com.evidencepilot.model.Document) invocation.getArgument(0);
            if (document.getId() == null) document.setId(UUID.randomUUID());
            return document;
        });

        service.ingestByDoi(null, collection.getId(), "10.1000/collection");

        verify(projectCollectionService).syncSource(
                org.mockito.ArgumentMatchers.argThat(document -> document.getCollection() == collection));
    }

    @Test
    void ingestByDoi_doesNotSaveDocumentWhenFetchFails() {
        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        doThrow(new OpenAlexClient.OpenAlexApiException("Invalid DOI: nope", 400))
                .when(openAlexClient).fetchWork("not-a-doi");

        assertThatThrownBy(() -> service.ingestByDoi(project.getId(), null, "not-a-doi"))
                .isInstanceOf(OpenAlexClient.OpenAlexApiException.class);

        verify(documentRepository, never()).save(any());
    }

    @Test
    void ingestByDoi_throwsWhenNeitherProjectNorCollection() {
        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);

        assertThatThrownBy(() -> service.ingestByDoi(null, null, "10.1000/xyz"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Either projectId or collectionId is required");
    }

    @Test
    void ingestByDoi_throwsWhenProjectNotFound() {
        UUID badId = UUID.randomUUID();
        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(projectRepository.findById(badId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.ingestByDoi(badId, null, "10.1000/xyz"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void ingestByDoi_throwsWhenProjectIsArchived() {
        project.setStatus(ProjectStatus.ARCHIVED);
        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        doThrow(new ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT, "Project is read-only."))
                .when(currentUserService).requireProjectWriteAccess(currentUser, project);

        assertThatThrownBy(() -> service.ingestByDoi(project.getId(), null, "10.1000/xyz"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("read-only");
    }

    @Test
    void tcTrc0201_getCitationGraphIncludesFailedDocumentsAndBothEdgeTypes() {
        Collection collection = collection();
        Document successful = citationDocument(collection, ProcessingStatus.UPLOADED);
        Document failed = citationDocument(collection, ProcessingStatus.FAILED);
        allowCitationGraph(collection);
        when(documentRepository.findByCollectionId(collection.getId()))
                .thenReturn(List.of(successful, failed));
        when(documentReferenceRepository.findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
                successful.getId(), EdgeType.REFERENCES))
                .thenReturn(List.of(reference("ref-success", EdgeType.REFERENCES)));
        when(documentReferenceRepository.findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
                successful.getId(), EdgeType.CITED_BY)).thenReturn(List.of());
        when(documentReferenceRepository.findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
                failed.getId(), EdgeType.REFERENCES)).thenReturn(List.of());
        when(documentReferenceRepository.findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
                failed.getId(), EdgeType.CITED_BY))
                .thenReturn(List.of(reference("ref-failed", EdgeType.CITED_BY)));

        var result = service.getCitationGraph(collection.getId(), true);

        assertThat(result.nodes())
                .filteredOn(node -> node.inCollection())
                .extracting(node -> node.id())
                .containsExactlyInAnyOrder(successful.getId().toString(), failed.getId().toString());
        assertThat(result.edges())
                .extracting(edge -> edge.type())
                .containsExactlyInAnyOrder(EdgeType.REFERENCES.name(), EdgeType.CITED_BY.name());
    }

    @Test
    void tcTrc0202_getCitationGraphExcludesFailedDocuments() {
        Collection collection = collection();
        Document successful = citationDocument(collection, ProcessingStatus.UPLOADED);
        Document failed = citationDocument(collection, ProcessingStatus.FAILED);
        allowCitationGraph(collection);
        when(documentRepository.findByCollectionId(collection.getId()))
                .thenReturn(List.of(successful, failed));
        when(documentReferenceRepository.findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
                successful.getId(), EdgeType.REFERENCES))
                .thenReturn(List.of(reference("ref-success", EdgeType.REFERENCES)));
        when(documentReferenceRepository.findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
                successful.getId(), EdgeType.CITED_BY)).thenReturn(List.of());

        var result = service.getCitationGraph(collection.getId(), false);

        assertThat(result.nodes())
                .extracting(node -> node.id())
                .contains(successful.getId().toString())
                .doesNotContain(failed.getId().toString());
        verify(documentReferenceRepository, never())
                .findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(eq(failed.getId()), any(EdgeType.class));
    }

    @Test
    void tcTrc0203_getCitationGraphCapsEachEdgeTypeAtTwentyPerDocument() {
        Collection collection = collection();
        Document document = citationDocument(collection, ProcessingStatus.UPLOADED);
        List<DocumentReference> references = IntStream.rangeClosed(1, 21)
                .mapToObj(index -> reference("ref-" + index, EdgeType.REFERENCES))
                .toList();
        allowCitationGraph(collection);
        when(documentRepository.findByCollectionId(collection.getId())).thenReturn(List.of(document));
        when(documentReferenceRepository.findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
                document.getId(), EdgeType.REFERENCES)).thenReturn(references);
        when(documentReferenceRepository.findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
                document.getId(), EdgeType.CITED_BY)).thenReturn(List.of());

        var result = service.getCitationGraph(collection.getId(), true);

        assertThat(result.edges()).hasSize(20);
        assertThat(result.nodes()).filteredOn(node -> !node.inCollection()).hasSize(20);
    }

    @Test
    void tcTrc0204_getCitationGraphRejectsMissingCollectionBeforeQueryingDocuments() {
        UUID collectionId = UUID.randomUUID();
        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(collectionRepository.findById(collectionId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getCitationGraph(collectionId, true))
                .isInstanceOf(ResourceNotFoundException.class);

        verifyNoInteractions(documentRepository, documentReferenceRepository);
    }

    @Test
    void tcTrc0205_getCitationGraphRejectsDeniedAccessBeforeQueryingDocuments() {
        Collection collection = collection();
        allowCitationGraph(collection);
        doThrow(new ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Collection access denied"))
                .when(currentUserService).requireCollectionAccess(currentUser, collection);

        assertThatThrownBy(() -> service.getCitationGraph(collection.getId(), true))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Collection access denied");

        verifyNoInteractions(documentRepository, documentReferenceRepository);
    }

    private Collection collection() {
        Collection collection = new Collection();
        collection.setId(UUID.randomUUID());
        collection.setInstructor(currentUser);
        collection.setTitle("Evidence Library");
        collection.setActive(true);
        return collection;
    }

    private Document citationDocument(Collection collection, ProcessingStatus status) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setCollection(collection);
        document.setProcessingStatus(status);
        document.setTitle("Document " + status);
        document.setDoi("10.1000/" + document.getId());
        return document;
    }

    private DocumentReference reference(String rawText, EdgeType edgeType) {
        DocumentReference reference = new DocumentReference();
        reference.setRawText(rawText);
        reference.setTitle(rawText);
        reference.setEdgeType(edgeType);
        return reference;
    }

    private void allowCitationGraph(Collection collection) {
        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));
    }
}
