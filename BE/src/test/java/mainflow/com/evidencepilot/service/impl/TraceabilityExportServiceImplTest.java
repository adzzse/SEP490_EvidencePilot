package com.evidencepilot.service.impl;

import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentReference;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.repository.DocumentReferenceRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TraceabilityExportServiceImplTest {

    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private DocumentReferenceRepository documentReferenceRepository;
    @Mock
    private FeedbackRequestRepository feedbackRequestRepository;
    @Mock
    private ProjectDocumentRepository projectDocumentRepository;
    @Mock
    private PaperSectionRepository paperSectionRepository;
    @Mock
    private EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;
    @Mock
    private CurrentUserServiceImpl currentUserService;

    private TraceabilityExportServiceImpl service;
    private User currentUser;
    private Project project;

    @BeforeEach
    void setUp() {
        service = new TraceabilityExportServiceImpl(
                projectRepository,
                documentRepository,
                documentReferenceRepository,
                feedbackRequestRepository,
                projectDocumentRepository,
                paperSectionRepository,
                evidenceRevisionTraceRepository,
                currentUserService);

        currentUser = new User();
        currentUser.setId(UUID.randomUUID());

        project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Traceability Project");
        project.setStatus(ProjectStatus.IN_PROGRESS);
        project.setActive(true);
    }

    @Test
    void tcTrc0101_exportsProjectMetadataSectionsDeduplicatedSourcesAndFeedback() {
        allowProject();
        Document source = document(DocumentType.SOURCE);
        source.setOriginalFilename("source.pdf");
        source.setContentType("application/pdf");
        source.setFileSizeBytes(128L);
        source.setFileUrl("sources/source.pdf");
        DocumentReference reference = new DocumentReference();
        reference.setDocument(source);

        ProjectDocument sharedSource = new ProjectDocument();
        sharedSource.setDocument(source);

        Document paper = document(DocumentType.PAPER);
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(paper);
        section.setAssignedUser(currentUser);
        section.setSectionTitle("Introduction");
        section.setContentTex("one two three");
        section.setVersion(2);
        section.setActive(true);

        FeedbackRequest feedback = new FeedbackRequest();
        feedback.setId(UUID.randomUUID());
        feedback.setInstructor(currentUser);
        feedback.setStatus(FeedbackStatus.PENDING);

        when(documentReferenceRepository
                .findByDocumentProjectIdAndDocumentDocTypeAndDocumentActiveTrueOrderByDocumentIdAscReferenceIndexAsc(
                        project.getId(), DocumentType.SOURCE))
                .thenReturn(List.of(reference));
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.SOURCE))
                .thenReturn(List.of(source));
        when(projectDocumentRepository.findByProjectId(project.getId())).thenReturn(List.of(sharedSource));
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.PAPER))
                .thenReturn(List.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId()))
                .thenReturn(List.of(feedback));
        when(evidenceRevisionTraceRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of());

        var result = service.exportTraceability(project.getId());

        assertThat(result.projectId()).isEqualTo(project.getId());
        assertThat(result.projectTitle()).isEqualTo(project.getTitle());
        assertThat(result.projectStatus()).isEqualTo(ProjectStatus.IN_PROGRESS);
        assertThat(result.sources()).singleElement().satisfies(exported -> {
            assertThat(exported.id()).isEqualTo(source.getId());
            assertThat(exported.referenceCount()).isEqualTo(1);
        });
        assertThat(result.sections()).singleElement().satisfies(exported -> {
            assertThat(exported.id()).isEqualTo(section.getId());
            assertThat(exported.wordCount()).isEqualTo(3);
            assertThat(exported.assignedUserId()).isEqualTo(currentUser.getId());
        });
        assertThat(result.feedback()).singleElement().satisfies(exported ->
                assertThat(exported.status()).isEqualTo(FeedbackStatus.PENDING));
        verify(currentUserService).requireProjectAccess(currentUser, project);
    }

    @Test
    void tcTrc0102_exportsCsvWithUtf8BomHeaderAndEscapedFields() {
        allowProject();
        Document paper = document(DocumentType.PAPER);
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(paper);
        section.setSectionTitle("Title, \"quoted\"\nnext");
        section.setContentTex("content");
        section.setActive(true);

        when(documentReferenceRepository
                .findByDocumentProjectIdAndDocumentDocTypeAndDocumentActiveTrueOrderByDocumentIdAscReferenceIndexAsc(
                        project.getId(), DocumentType.SOURCE))
                .thenReturn(List.of());
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.SOURCE))
                .thenReturn(List.of());
        when(projectDocumentRepository.findByProjectId(project.getId())).thenReturn(List.of());
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.PAPER))
                .thenReturn(List.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId()))
                .thenReturn(List.of());
        when(evidenceRevisionTraceRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of());

        byte[] csv = service.exportTraceabilityCsv(project.getId());
        String text = new String(csv, StandardCharsets.UTF_8);

        assertThat(csv).startsWith((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
        assertThat(text).startsWith("\uFEFFSection ID,Section Title,Word Count");
        assertThat(text).contains("\"Title, \"\"quoted\"\"\nnext\"");
    }

    @Test
    void tcTrc0103_rejectsMissingProjectBeforeQueryingTraceabilityData() {
        UUID projectId = UUID.randomUUID();
        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(projectRepository.findById(projectId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.exportTraceability(projectId))
                .isInstanceOf(ResourceNotFoundException.class);

        verifyNoDataQueries();
    }

    @Test
    void tcTrc0104_rejectsInactiveProjectBeforeQueryingTraceabilityData() {
        project.setActive(false);
        allowProject();

        assertThatThrownBy(() -> service.exportTraceability(project.getId()))
                .isInstanceOf(ResourceNotFoundException.class);

        verifyNoDataQueries();
    }

    @Test
    void tcTrc0105_rejectsDeniedAccessBeforeQueryingTraceabilityData() {
        allowProject();
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Project access denied"))
                .when(currentUserService).requireProjectAccess(currentUser, project);

        assertThatThrownBy(() -> service.exportTraceability(project.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Project access denied");

        verifyNoDataQueries();
    }

    private void allowProject() {
        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
    }

    private Document document(DocumentType type) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setProject(project);
        document.setDocType(type);
        document.setActive(true);
        return document;
    }

    private void verifyNoDataQueries() {
        verifyNoInteractions(
                documentRepository,
                documentReferenceRepository,
                feedbackRequestRepository,
                projectDocumentRepository,
                paperSectionRepository,
                evidenceRevisionTraceRepository);
    }
}
