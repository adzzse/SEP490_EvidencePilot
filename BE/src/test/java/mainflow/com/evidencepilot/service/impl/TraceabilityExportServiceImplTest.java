package com.evidencepilot.service.impl;

import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.dto.response.ProgressReportResponse;
import com.evidencepilot.dto.response.ProjectSourceMapResponse;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentReference;
import com.evidencepilot.model.EvidenceRevisionTrace;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackReply;
import com.evidencepilot.model.FeedbackAttachment;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.ReplyAuthorRole;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentReferenceRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.FeedbackAttachmentRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.DocumentObjectStorage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipInputStream;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
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
    private InstructorFeedbackRepository instructorFeedbackRepository;
    @Mock
    private FeedbackAttachmentRepository feedbackAttachmentRepository;
    @Mock
    private DocumentObjectStorage objectStorage;
    @Mock
    private ProjectDocumentRepository projectDocumentRepository;
    @Mock
    private PaperSectionRepository paperSectionRepository;
    @Mock
    private EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;
    @Mock
    private CurrentUserServiceImpl currentUserService;
    @Mock
    private ProjectSourceMapService projectSourceMapService;
    @Mock
    private ProgressReportServiceImpl progressReportService;

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
                instructorFeedbackRepository,
                feedbackAttachmentRepository,
                objectStorage,
                projectDocumentRepository,
                paperSectionRepository,
                evidenceRevisionTraceRepository,
                currentUserService,
                projectSourceMapService,
                progressReportService);

        currentUser = new User();
        currentUser.setId(UUID.randomUUID());
        currentUser.setRole(UserRole.INSTRUCTOR);

        project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Traceability Project");
        project.setStatus(ProjectStatus.IN_PROGRESS);
        project.setActive(true);
    }

    @Test
    void tcTrc0101_exportsProjectMetadataSectionsDeduplicatedSourcesAndFeedback() {
        allowExportData();
        Document source = document(DocumentType.SOURCE);
        source.setOriginalFilename("source.pdf");
        source.setContentType("application/pdf");
        source.setFileSizeBytes(128L);
        source.setFileUrl("sources/source.pdf");
        DocumentReference reference = new DocumentReference();
        reference.setId(UUID.randomUUID());
        reference.setDocument(source);
        reference.setRawText("External citation raw text");

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
        feedback.setStudent(currentUser);
        feedback.setInstructor(currentUser);
        feedback.setStatus(FeedbackStatus.PENDING);
        InstructorFeedback comment = new InstructorFeedback();
        comment.setId(UUID.randomUUID());
        comment.setRequest(feedback);
        comment.setSection(section);
        comment.setContent("Check this source");
        comment.setPublishedAt(LocalDateTime.now());
        FeedbackReply publishedReply = new FeedbackReply();
        publishedReply.setId(UUID.randomUUID());
        publishedReply.setFeedback(comment);
        publishedReply.setContent("Student response");
        publishedReply.setAuthorRole(ReplyAuthorRole.STUDENT);
        publishedReply.setCreatedAt(LocalDateTime.now());
        publishedReply.setPublishedAt(LocalDateTime.now());
        FeedbackReply draftReply = new FeedbackReply();
        draftReply.setId(UUID.randomUUID());
        draftReply.setFeedback(comment);
        draftReply.setContent("Unpublished draft");
        comment.getReplies().addAll(List.of(publishedReply, draftReply));

        when(documentReferenceRepository.findForDocuments(List.of(source.getId()))).thenReturn(List.of(reference));
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.SOURCE))
                .thenReturn(List.of(source));
        when(projectDocumentRepository.findByProjectId(project.getId())).thenReturn(List.of(sharedSource));
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.PAPER))
                .thenReturn(List.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId()))
                .thenReturn(List.of(feedback));
        when(instructorFeedbackRepository.findByRequestProjectId(project.getId())).thenReturn(List.of(comment));
        when(evidenceRevisionTraceRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of());
        var member = new ProgressReportResponse.MemberContribution(currentUser.getId(), "Student One", 1, 3,
                2, 1, 3, 2, null, 0, 1, List.of("Introduction"), List.of());
        when(progressReportService.buildReport(project.getId(), "ALL", null, null)).thenReturn(
                new ProgressReportResponse(project.getId(), List.of(), List.of(member), null));

        var result = service.exportTraceability(project.getId());

        assertThat(result.projectId()).isEqualTo(project.getId());
        assertThat(result.projectTitle()).isEqualTo(project.getTitle());
        assertThat(result.projectStatus()).isEqualTo(ProjectStatus.IN_PROGRESS);
        assertThat(result.papers()).singleElement().satisfies(exported -> assertThat(exported.id()).isEqualTo(paper.getId()));
        assertThat(result.sources()).singleElement().satisfies(exported -> {
            assertThat(exported.id()).isEqualTo(source.getId());
            assertThat(exported.referenceCount()).isEqualTo(1);
            assertThat(exported.title()).isNull();
        });
        assertThat(result.sourceReferences()).singleElement().satisfies(exported -> {
            assertThat(exported.sourceId()).isEqualTo(source.getId());
            assertThat(exported.rawText()).isEqualTo("External citation raw text");
        });
        assertThat(result.sections()).singleElement().satisfies(exported -> {
            assertThat(exported.id()).isEqualTo(section.getId());
            assertThat(exported.wordCount()).isEqualTo(3);
            assertThat(exported.assignedUserId()).isEqualTo(currentUser.getId());
            assertThat(exported.paperId()).isEqualTo(paper.getId());
            assertThat(exported.contentTex()).isEqualTo("one two three");
        });
        assertThat(result.feedback()).singleElement().satisfies(exported ->
                assertThat(exported.status()).isEqualTo(FeedbackStatus.PENDING));
        assertThat(result.feedbackComments()).singleElement().satisfies(exported ->
                assertThat(exported.content()).isEqualTo("Check this source"));
        assertThat(result.feedbackReplies()).singleElement().satisfies(exported -> {
            assertThat(exported.feedbackId()).isEqualTo(comment.getId());
            assertThat(exported.content()).isEqualTo("Student response");
        });
        assertThat(result.memberProgress()).singleElement().satisfies(exported ->
                assertThat(exported.saveCount()).isEqualTo(2));
        verify(currentUserService).requireProjectAccess(currentUser, project);
    }

    @Test
    void tcTrc0102_exportsCsvWithUtf8BomHeaderAndEscapedFields() throws Exception {
        allowExportData();
        Document paper = document(DocumentType.PAPER);
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(paper);
        section.setSectionTitle("Title, \"quoted\"\nnext");
        section.setContentTex("content");
        section.setActive(true);
        FeedbackRequest feedback = new FeedbackRequest();
        feedback.setId(UUID.randomUUID());
        feedback.setInstructor(currentUser);
        InstructorFeedback comment = new InstructorFeedback();
        comment.setId(UUID.randomUUID());
        comment.setRequest(feedback);
        comment.setSection(section);
        comment.setContent("Image evidence");
        comment.setPublishedAt(LocalDateTime.now());
        FeedbackAttachment image = new FeedbackAttachment();
        image.setId(UUID.randomUUID());
        image.setFeedback(comment);
        image.setMimeType("image/png");
        image.setFileSizeBytes(4L);
        image.setStorageKey("feedback/image.png");
        FeedbackReply draft = new FeedbackReply();
        draft.setId(UUID.randomUUID());
        FeedbackAttachment draftImage = new FeedbackAttachment();
        draftImage.setId(UUID.randomUUID());
        draftImage.setFeedback(comment);
        draftImage.setReply(draft);
        draftImage.setMimeType("image/png");
        draftImage.setStorageKey("feedback/draft.png");

        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.SOURCE))
                .thenReturn(List.of());
        when(projectDocumentRepository.findByProjectId(project.getId())).thenReturn(List.of());
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.PAPER))
                .thenReturn(List.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId()))
                .thenReturn(List.of());
        when(instructorFeedbackRepository.findByRequestProjectId(project.getId())).thenReturn(List.of(comment));
        when(feedbackAttachmentRepository.findByProjectId(project.getId())).thenReturn(List.of(image, draftImage));
        when(objectStorage.getStream("feedback/image.png"))
                .thenReturn(new ByteArrayInputStream("PNG!".getBytes(StandardCharsets.UTF_8)));
        when(evidenceRevisionTraceRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of());

        Path archive = service.exportTraceabilityCsv(project.getId());
        Map<String, String> tables;
        try {
            tables = unzip(Files.readAllBytes(archive));
        } finally {
            Files.deleteIfExists(archive);
        }

        assertThat(tables).containsKeys("project.csv", "papers.csv", "sections.csv", "sources.csv",
                "source-references.csv",
                "source-relations.csv", "feedback.csv", "feedback-replies.csv", "feedback-attachments.csv",
                "evidence-traces.csv", "member-progress.csv");
        assertThat(tables.get("sections.csv")).startsWith("\uFEFF\"id\",\"paper_id\"");
        assertThat(tables.get("sections.csv")).contains("\"Title, \"\"quoted\"\"\nnext\"");
        String imagePath = "data/feedback-attachments/" + image.getId() + ".png";
        assertThat(tables.get("feedback-attachments.csv")).contains(imagePath, comment.getId().toString());
        assertThat(tables.get(imagePath)).isEqualTo("PNG!");
        assertThat(tables).doesNotContainKey("data/feedback-attachments/" + draftImage.getId() + ".png");
    }

    @Test
    void memberExportsOnlyFeedbackAndImagesForAssignedSections() throws Exception {
        currentUser.setRole(UserRole.STUDENT);
        ProjectMember membership = new ProjectMember();
        membership.setUser(currentUser);
        membership.setRole(ProjectRole.MEMBER);
        project.setProjectMembers(List.of(membership));
        allowExportData();

        User other = new User();
        other.setId(UUID.randomUUID());
        PaperSection assigned = new PaperSection();
        assigned.setId(UUID.randomUUID());
        assigned.setAssignedUser(currentUser);
        assigned.setActive(true);
        assigned.setContentTex("Assigned section text");
        PaperSection unassigned = new PaperSection();
        unassigned.setId(UUID.randomUUID());
        unassigned.setAssignedUser(other);
        unassigned.setActive(true);
        unassigned.setContentTex("Other member section text");
        Document paper = document(DocumentType.PAPER);
        assigned.setDocument(paper);
        unassigned.setDocument(paper);
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.SOURCE))
                .thenReturn(List.of());
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.PAPER))
                .thenReturn(List.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(assigned, unassigned));
        EvidenceRevisionTrace ownTrace = trace(assigned, "Own rationale");
        EvidenceRevisionTrace otherTrace = trace(unassigned, "Other rationale");
        PaperSection inactive = new PaperSection();
        inactive.setId(UUID.randomUUID());
        inactive.setDocument(paper);
        EvidenceRevisionTrace historicalTrace = trace(inactive, "Historical rationale");
        when(evidenceRevisionTraceRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of(ownTrace, otherTrace, historicalTrace));
        FeedbackRequest request = new FeedbackRequest();
        request.setId(UUID.randomUUID());
        InstructorFeedback visible = new InstructorFeedback();
        visible.setId(UUID.randomUUID());
        visible.setRequest(request);
        visible.setSection(assigned);
        visible.setContent("Assigned comment");
        visible.setPublishedAt(LocalDateTime.now());
        InstructorFeedback hidden = new InstructorFeedback();
        hidden.setId(UUID.randomUUID());
        hidden.setRequest(request);
        hidden.setSection(unassigned);
        hidden.setContent("Other member comment");
        hidden.setPublishedAt(LocalDateTime.now());
        FeedbackReply hiddenReply = new FeedbackReply();
        hiddenReply.setId(UUID.randomUUID());
        hiddenReply.setFeedback(hidden);
        hiddenReply.setPublishedAt(LocalDateTime.now());
        hidden.getReplies().add(hiddenReply);

        FeedbackAttachment visibleImage = new FeedbackAttachment();
        visibleImage.setId(UUID.randomUUID());
        visibleImage.setFeedback(visible);
        visibleImage.setMimeType("image/png");
        visibleImage.setStorageKey("feedback/visible.png");
        FeedbackAttachment hiddenImage = new FeedbackAttachment();
        hiddenImage.setId(UUID.randomUUID());
        hiddenImage.setFeedback(hidden);
        hiddenImage.setMimeType("image/png");
        hiddenImage.setStorageKey("feedback/hidden.png");
        when(instructorFeedbackRepository.findByRequestProjectId(project.getId())).thenReturn(List.of(visible, hidden));
        when(feedbackAttachmentRepository.findByProjectId(project.getId()))
                .thenReturn(List.of(visibleImage, hiddenImage));
        when(objectStorage.getStream("feedback/visible.png"))
                .thenReturn(new ByteArrayInputStream(new byte[] {1, 2, 3}));

        var snapshot = service.exportTraceability(project.getId());
        assertThat(snapshot.feedbackComments()).extracting(item -> item.id()).containsExactly(visible.getId());
        assertThat(snapshot.feedbackReplies()).isEmpty();
        assertThat(snapshot.feedbackAttachments()).extracting(item -> item.id()).containsExactly(visibleImage.getId());
        assertThat(snapshot.sections()).extracting(item -> item.id())
                .containsExactly(assigned.getId(), unassigned.getId());
        assertThat(snapshot.traces()).extracting(item -> item.id()).containsExactly(ownTrace.getId());

        Path archive = service.exportTraceabilityCsv(project.getId());
        try {
            Map<String, String> files = unzip(Files.readAllBytes(archive));
            assertThat(files.get("feedback-comments.csv")).contains("Assigned comment").doesNotContain("Other member comment");
            assertThat(files.get("sections.csv")).contains("Assigned section text", "Other member section text");
            assertThat(files.get("evidence-traces.csv")).contains("Own rationale")
                    .doesNotContain("Other rationale");
            assertThat(files.get("feedback-attachments.csv")).contains(visibleImage.getId().toString())
                    .doesNotContain(hiddenImage.getId().toString());
            assertThat(files).containsKey("data/feedback-attachments/" + visibleImage.getId() + ".png")
                    .doesNotContainKey("data/feedback-attachments/" + hiddenImage.getId() + ".png");
        } finally {
            Files.deleteIfExists(archive);
        }
        verify(objectStorage, never()).getStream("feedback/hidden.png");
        currentUser.setRole(UserRole.INSTRUCTOR);
        assertThat(service.exportTraceability(project.getId()).traces()).extracting(item -> item.id())
                .containsExactly(ownTrace.getId(), otherTrace.getId(), historicalTrace.getId());
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

    private void allowExportData() {
        allowProject();
        when(projectSourceMapService.buildMap(project)).thenReturn(new ProjectSourceMapResponse(
                new ProjectSourceMapResponse.ProjectNode(project.getId(), project.getTitle()),
                List.of(), List.of(), List.of()));
        when(progressReportService.buildReport(project.getId(), "ALL", null, null))
                .thenReturn(new ProgressReportResponse(project.getId(), List.of(), List.of(), null));
    }

    private Map<String, String> unzip(byte[] bytes) {
        Map<String, String> tables = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes), StandardCharsets.UTF_8)) {
            java.util.zip.ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                tables.put(entry.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
            }
        } catch (java.io.IOException exception) {
            throw new AssertionError(exception);
        }
        return tables;
    }

    private Document document(DocumentType type) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setProject(project);
        document.setDocType(type);
        document.setActive(true);
        return document;
    }

    private EvidenceRevisionTrace trace(PaperSection section, String rationale) {
        EvidenceRevisionTrace trace = new EvidenceRevisionTrace();
        trace.setId(UUID.randomUUID());
        trace.setSection(section);
        trace.setRationale(rationale);
        trace.setExplanation(rationale + " explanation");
        trace.setInstructorFeedback(rationale + " instructor note");
        return trace;
    }

    private void verifyNoDataQueries() {
        verifyNoInteractions(
                documentRepository,
                documentReferenceRepository,
                feedbackRequestRepository,
                instructorFeedbackRepository,
                feedbackAttachmentRepository,
                projectDocumentRepository,
                paperSectionRepository,
                evidenceRevisionTraceRepository);
    }
}
