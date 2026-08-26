package com.evidencepilot.controller;

import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.JobSubmitResponse;
import com.evidencepilot.dto.response.PaperSectionResponse;
import com.evidencepilot.dto.response.PaperStandardSuggestionResponse;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CitationValidationService;
import com.evidencepilot.service.AiEvaluationService;
import com.evidencepilot.service.CheckpointService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.DocumentService;
import com.evidencepilot.service.PaperProcessingService;
import com.evidencepilot.service.impl.SectionCitationReviewService;
import com.evidencepilot.service.impl.EvidenceTraceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class PaperControllerTest {

    private final DocumentService documentService = mock(DocumentService.class);
    private final PaperProcessingService paperService = mock(PaperProcessingService.class);
    private final CitationValidationService citationValidationService = mock(CitationValidationService.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final DocumentRepository documentRepository = mock(DocumentRepository.class);
    private final PaperSectionRepository paperSectionRepository = mock(PaperSectionRepository.class);
    private final InstructorFeedbackRepository instructorFeedbackRepository = mock(InstructorFeedbackRepository.class);
    private final FeedbackRequestRepository feedbackRequestRepository = mock(FeedbackRequestRepository.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final CheckpointService checkpointService = mock(CheckpointService.class);
    private final AiEvaluationService aiEvaluationService = mock(AiEvaluationService.class);
    private final SectionCitationReviewService sectionCitationReviewService = mock(SectionCitationReviewService.class);
    private final EvidenceTraceService evidenceTraceService = mock(EvidenceTraceService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = standaloneSetup(new PaperController(documentService, paperService, citationValidationService, projectRepository, documentRepository, paperSectionRepository, instructorFeedbackRepository, feedbackRequestRepository, currentUserService, checkpointService, aiEvaluationService, sectionCitationReviewService, evidenceTraceService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void findAll_delegatesToCurrentUserScope() throws Exception {
        mockMvc.perform(get("/api/papers")).andExpect(status().isOk());
        verify(documentService).getAllPapersForCurrentUser();
    }

    @Test
    void findById_returnsActivePaper() throws Exception {
        UUID id = UUID.randomUUID();
        DocumentResponse paper = mock(DocumentResponse.class);
        when(paper.docType()).thenReturn(DocumentType.PAPER);
        when(paper.active()).thenReturn(true);
        when(documentService.getDocumentById(id)).thenReturn(paper);

        mockMvc.perform(get("/api/papers/{id}", id)).andExpect(status().isOk());
    }

    @Test
    void findById_rejectsSourceDocument() throws Exception {
        UUID id = UUID.randomUUID();
        DocumentResponse source = mock(DocumentResponse.class);
        when(source.docType()).thenReturn(DocumentType.SOURCE);
        when(source.active()).thenReturn(true);
        when(documentService.getDocumentById(id)).thenReturn(source);

        mockMvc.perform(get("/api/papers/{id}", id)).andExpect(status().isNotFound());
    }

    @Test
    void findByProject_filtersInactiveAndSourceDocuments() throws Exception {
        UUID projectId = UUID.randomUUID();
        DocumentResponse paper = document(DocumentType.PAPER, true);
        DocumentResponse source = document(DocumentType.SOURCE, true);
        DocumentResponse inactivePaper = document(DocumentType.PAPER, false);
        when(documentService.getDocumentsByProject(projectId)).thenReturn(List.of(paper, source, inactivePaper));

        mockMvc.perform(get("/api/projects/{id}/papers", projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void sections_delegatesPaperId() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(get("/api/papers/{id}/sections", id)).andExpect(status().isOk());
        verify(paperService).getPaperSections(id);
    }

    @Test
    void standardSuggestion_returnsAdvisoryResult() throws Exception {
        UUID id = UUID.randomUUID();
        when(paperService.suggestStandard(id)).thenReturn(
                new PaperStandardSuggestionResponse(
                        PaperStandard.IEEE, 99, List.of("IEEEtran")));

        mockMvc.perform(get("/api/papers/{id}/standard-suggestion", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestedStandard").value("IEEE"))
                .andExpect(jsonPath("$.confidencePercent").value(99))
                .andExpect(jsonPath("$.evidence[0]").value("IEEEtran"));

        verify(paperService).suggestStandard(id);
    }

    @Test
    void updateSection_bindsStructureParameters() throws Exception {
        UUID paperId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        when(paperService.updateSection(
                paperId, sectionId, "Methods", 2, null, null, null))
                .thenReturn(sectionResponse(paperId, sectionId, null));

        mockMvc.perform(put("/api/papers/{paperId}/sections/{sectionId}", paperId, sectionId)
                        .param("title", "Methods")
                        .param("order", "2"))
                .andExpect(status().isOk());

        verify(paperService).updateSection(
                paperId, sectionId, "Methods", 2, null, null, null);
    }

    @Test
    void updateSection_bindsContentFromBody() throws Exception {
        UUID paperId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        String content = "Section body text.";
        when(paperService.updateSection(
                paperId, sectionId, null, null, null, content, 7L))
                .thenReturn(sectionResponse(paperId, sectionId, content));

        mockMvc.perform(put("/api/papers/{paperId}/sections/{sectionId}", paperId, sectionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"" + content
                                + "\",\"expectedRevision\":7}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(sectionId.toString()))
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.revision").value(8))
                .andExpect(jsonPath("$.updatedAt").exists())
                .andExpect(jsonPath("$.contentTex").doesNotExist())
                .andExpect(jsonPath("$.previousContentTex").doesNotExist());

        verify(paperService).updateSection(
                paperId, sectionId, null, null, null, content, 7L);
    }

    @Test
    void updateSection_acceptsLargeContentInBody() throws Exception {
        UUID paperId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        String content = "x".repeat(100_000);
        when(paperService.updateSection(
                paperId, sectionId, null, null, null, content, 7L))
                .thenReturn(sectionResponse(paperId, sectionId, content));

        mockMvc.perform(put("/api/papers/{paperId}/sections/{sectionId}", paperId, sectionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"" + content
                                + "\",\"expectedRevision\":7}"))
                .andExpect(status().isOk());

        verify(paperService).updateSection(
                paperId, sectionId, null, null, null, content, 7L);
    }

    @Test
    void updateSection_rejectsContentAboveLimit() throws Exception {
        UUID paperId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        String content = "x".repeat(5_000_001);

        mockMvc.perform(put("/api/papers/{paperId}/sections/{sectionId}", paperId, sectionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"" + content
                                + "\",\"expectedRevision\":7}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(paperService);
    }

    @Test
    void updateSection_requiresExpectedRevisionForContent() throws Exception {
        UUID paperId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();

        mockMvc.perform(put("/api/papers/{paperId}/sections/{sectionId}", paperId, sectionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"Section body text.\"}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(paperService);
    }

    @Test
    void rollbackSection_bindsExpectedRevision() throws Exception {
        UUID paperId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        when(paperService.rollbackSection(paperId, sectionId, 7L))
                .thenReturn(sectionResponse(paperId, sectionId, "restored"));

        mockMvc.perform(post("/api/papers/{paperId}/sections/{sectionId}/rollback",
                        paperId, sectionId)
                        .param("expectedRevision", "7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(8));

        verify(paperService).rollbackSection(paperId, sectionId, 7L);
    }

    @Test
    void createSection_allowsMissingParentParameter() throws Exception {
        UUID paperId = UUID.randomUUID();

        mockMvc.perform(post("/api/papers/{paperId}/sections/create", paperId)
                        .param("title", "Conclusion"))
                .andExpect(status().isCreated());

        verify(paperService).createSection(paperId, "Conclusion", null);
    }

    @Test
    void assignSection_bindsAssignedStudent() throws Exception {
        UUID paperId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID studentId = UUID.randomUUID();

        mockMvc.perform(put("/api/papers/{paperId}/sections/{sectionId}/assign", paperId, sectionId)
                        .param("assignedUserId", studentId.toString()))
                .andExpect(status().isOk());

        verify(paperService).assignSection(paperId, sectionId, studentId);
    }

    @Test
    void deleteSection_returns204() throws Exception {
        UUID paperId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();

        mockMvc.perform(delete("/api/papers/{paperId}/sections/{sectionId}", paperId, sectionId))
                .andExpect(status().isNoContent());

        verify(paperService).deleteSection(paperId, sectionId);
    }

    @Test
    void reviewSection_queuesSavedSectionFingerprint() throws Exception {
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        Document document = paperDocument(projectId);
        document.setId(documentId);
        document.setActive(true);
        document.setDocType(DocumentType.PAPER);
        PaperSection section = sectionOf(document);
        section.setId(sectionId);
        section.setActive(true);
        section.setContentTex("Draft section");
        User user = new User();
        user.setId(userId);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(paperSectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(sectionCitationReviewService.reviewInputFingerprint(section))
                .thenReturn("fingerprint");
        when(aiEvaluationService.submitSectionCitationReview(
                projectId, documentId, sectionId, "fingerprint", userId))
                .thenReturn(new JobSubmitResponse(jobId));

        mockMvc.perform(post("/api/papers/{documentId}/sections/{sectionId}/review", documentId, sectionId))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.jobId").value(jobId.toString()));
        verify(currentUserService).requireSectionContentWriteAccess(user, section);
        verify(aiEvaluationService).submitSectionCitationReview(
                projectId, documentId, sectionId, "fingerprint", userId);
    }

    @Test
    void reviewSection_authorizesBeforeSubmittingJob() throws Exception {
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        Document document = paperDocument(projectId);
        document.setId(documentId);
        document.setActive(true);
        document.setDocType(DocumentType.PAPER);
        PaperSection section = sectionOf(document);
        section.setId(sectionId);
        section.setActive(true);
        section.setContentTex("Draft section");
        User user = new User();
        user.setId(UUID.randomUUID());
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(paperSectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "no access"))
                .when(currentUserService).requireSectionContentWriteAccess(user, section);

        mockMvc.perform(post("/api/papers/{documentId}/sections/{sectionId}/review", documentId, sectionId))
                .andExpect(status().isForbidden());

        verify(aiEvaluationService, never())
                .submitSectionCitationReview(any(), any(), any(), any(), any());
    }

    @Test
    void delete_returns204() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(delete("/api/papers/{id}", id)).andExpect(status().isNoContent());
        verify(documentService).deleteDocument(id);
    }

    @Test
    void upload_returns201WithoutDetectingSectionsSynchronously() throws Exception {
        UUID projectId = UUID.randomUUID();
        Project project = project(projectId);
        project.setTargetStandard(PaperStandard.IEEE);
        DocumentResponse response = mock(DocumentResponse.class);
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER)).thenReturn(List.of());
        when(documentService.uploadDocument(eq(projectId), any(), eq(DocumentType.PAPER))).thenReturn(response);
        MockMultipartFile file = new MockMultipartFile("file", "paper.pdf", "application/pdf", "pdf".getBytes());

        mockMvc.perform(multipart("/api/papers").file(file).param("projectId", projectId.toString()))
                .andExpect(status().isCreated());

        verify(documentService).uploadDocument(eq(projectId), any(), eq(DocumentType.PAPER));
        assertThat(project.getTargetStandard()).isNull();
    }

    @Test
    void upload_authorizesBeforeAnyDestructiveMutation() throws Exception {
        UUID projectId = UUID.randomUUID();
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project(projectId)));
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "no access"))
                .when(currentUserService).requireProjectWriteAccess(any(), any());
        Document paper = paperDocument(projectId);
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER))
                .thenReturn(List.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId())).thenReturn(List.of());
        MockMultipartFile file = new MockMultipartFile("file", "paper.pdf", "application/pdf", "pdf".getBytes());

        mockMvc.perform(multipart("/api/papers").file(file).param("projectId", projectId.toString()))
                .andExpect(status().isForbidden());

        verify(paperSectionRepository, never()).deleteByDocumentId(any());
        verify(documentRepository, never()).deleteById(any());
        verify(documentService, never()).uploadDocument(any(), any(), any());
    }

    @Test
    void upload_refusesWhenInstructorFeedbackExists() throws Exception {
        UUID projectId = UUID.randomUUID();
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project(projectId)));
        Document paper = paperDocument(projectId);
        PaperSection section = sectionOf(paper);
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER))
                .thenReturn(List.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));
        com.evidencepilot.model.InstructorFeedback feedback =
                mock(com.evidencepilot.model.InstructorFeedback.class);
        when(feedback.getSection()).thenReturn(section);
        when(instructorFeedbackRepository.findByRequestProjectId(projectId)).thenReturn(List.of(feedback));
        MockMultipartFile file = new MockMultipartFile("file", "paper.pdf", "application/pdf", "pdf".getBytes());

        mockMvc.perform(multipart("/api/papers").file(file).param("projectId", projectId.toString()))
                .andExpect(status().isConflict());

        verify(documentService, never()).uploadDocument(any(), any(), any());
    }

    @Test
    void upload_refusesWhenFeedbackReviewIsOpen() throws Exception {
        UUID projectId = UUID.randomUUID();
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project(projectId)));
        Document paper = paperDocument(projectId);
        PaperSection section = sectionOf(paper);
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER))
                .thenReturn(List.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));
        when(instructorFeedbackRepository.findByRequestProjectId(projectId)).thenReturn(List.of());
        FeedbackRequest open = new FeedbackRequest();
        open.setStatus(FeedbackStatus.RETURNED);
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(projectId)).thenReturn(List.of(open));
        MockMultipartFile file = new MockMultipartFile("file", "paper.pdf", "application/pdf", "pdf".getBytes());

        mockMvc.perform(multipart("/api/papers").file(file).param("projectId", projectId.toString()))
                .andExpect(status().isConflict());

        verify(documentService, never()).uploadDocument(any(), any(), any());
    }

    @Test
    void initPaperSections_doesNotLeakExistingPaperBeforeAuthorization() throws Exception {
        UUID projectId = UUID.randomUUID();
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project(projectId)));
        when(currentUserService.requireCurrentUser()).thenReturn(null);
        when(currentUserService.isInstructor(any())).thenReturn(false);

        mockMvc.perform(post("/api/projects/{projectId}/papers/init", projectId))
                .andExpect(status().isForbidden());

        verify(documentRepository, never()).findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER);
    }

    private static Project project(UUID id) {
        Project p = new Project();
        p.setId(id);
        return p;
    }

    private static Document paperDocument(UUID projectId) {
        Document d = new Document();
        d.setId(UUID.randomUUID());
        Project p = project(projectId);
        d.setProject(p);
        return d;
    }

    private static PaperSection sectionOf(Document paper) {
        PaperSection s = new PaperSection();
        s.setId(UUID.randomUUID());
        s.setDocument(paper);
        return s;
    }

    private static PaperSectionResponse sectionResponse(UUID paperId, UUID sectionId, String content) {
        return new PaperSectionResponse(
                sectionId,
                paperId,
                null,
                null,
                1,
                "Section",
                content,
                null,
                2,
                8L,
                null,
                LocalDateTime.of(2026, 8, 17, 10, 0));
    }

    private static DocumentResponse document(DocumentType type, boolean active) {
        DocumentResponse response = mock(DocumentResponse.class);
        when(response.docType()).thenReturn(type);
        when(response.active()).thenReturn(active);
        return response;
    }
}
