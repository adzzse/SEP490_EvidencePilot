package com.evidencepilot.service.impl;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentText;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AuditService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.PaperStandardService;
import com.evidencepilot.service.SystemNotificationService;
import com.evidencepilot.service.TexArchiveBuilder;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaperProcessingServiceImplTest {

    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private PaperSectionRepository paperSectionRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private CurrentUserService currentUserService;
    @Mock
    private AuditService auditService;
    @Mock
    private EvidenceTraceService evidenceTraceService;

    @Test
    void detectsLatexSections() {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        DocumentText text = new DocumentText();
        text.setDocument(document);
        text.setExtractedText("""
                \\documentclass{article}
                \\begin{document}
                \\section{Introduction}
                First section.
                \\section*{Methods}
                Second section.
                \\end{document}
                """);
        document.setDocumentText(text);

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId)).thenReturn(List.of());
        List<PaperSection> saved = new ArrayList<>();
        when(paperSectionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            Iterable<PaperSection> sections = invocation.getArgument(0);
            sections.forEach(saved::add);
            return saved;
        });

        service().detectAndPersistSections(documentId);

        assertThat(saved).extracting(PaperSection::getSectionTitle)
                .containsExactly("Introduction", "Methods");
        assertThat(saved).extracting(PaperSection::getContentTex)
                .containsExactly("First section.", "Second section.\n\\end{document}");
    }

    @Test
    void usesExtractorHierarchyForTopLevelSections() {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        DocumentText text = new DocumentText();
        text.setDocument(document);
        text.setExtractedText("""
                # Evaluation of adipokines
                ## Abstract
                Abstract body.
                ## Introduction
                Introduction body.
                ## Material and methods Study design
                Study design body.
                ## Population
                Population body.
                ## Laboratory methods
                Laboratory body.
                ## Leptin and Vaspin Quantification: Enzymatic Method (Diasource, KAP2281)
                Assay body.
                ## Statistical analysis
                Statistics body.
                ## Results
                Results body.
                ## Adipokine level correlation analysis and principal component scores
                Correlation body.
                ## Discussion
                Discussion body.
                ## Study limitations
                Limitations body.
                ## Conclusions
                Conclusion body.
                ## Acknowledgments
                Thanks.
                ## References
                Reference 1.
                """);
        document.setDocumentText(text);
        List<AiModelClient.ExtractionBlock> blocks = List.of(
                heading("Evaluation of adipokines", 1),
                heading("Abstract", 2),
                heading("Introduction", 2),
                heading("Material and methods Study design", 2),
                heading("Population", 3),
                heading("Laboratory methods", 3),
                heading("Leptin and Vaspin Quantification: Enzymatic Method (Diasource, KAP2281)", 3),
                heading("Statistical analysis", 3),
                heading("Results", 2),
                heading("Adipokine level correlation analysis and principal component scores", 3),
                heading("Discussion", 2),
                heading("Study limitations", 3),
                heading("Conclusions", 2),
                heading("Acknowledgments", 2),
                new AiModelClient.ExtractionBlock("reference", "References", null, null));

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId)).thenReturn(List.of());
        List<PaperSection> saved = new ArrayList<>();
        when(paperSectionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            Iterable<PaperSection> sections = invocation.getArgument(0);
            sections.forEach(saved::add);
            return saved;
        });

        service().detectAndPersistSections(documentId, blocks);

        assertThat(saved).extracting(PaperSection::getSectionTitle)
                .containsExactly(
                        "Abstract",
                        "Introduction",
                        "Material and methods",
                        "Results",
                        "Discussion",
                        "Conclusions",
                        "Acknowledgments",
                        "References");
        assertThat(saved.get(2).getContentTex())
                .startsWith("## Study design\n\nStudy design body.")
                .contains("## Population")
                .contains("## Laboratory methods")
                .contains("## Leptin and Vaspin Quantification: Enzymatic Method (Diasource, KAP2281)")
                .contains("## Statistical analysis");
        assertThat(saved.get(3).getContentTex())
                .contains("## Adipokine level correlation analysis and principal component scores");
        assertThat(saved.get(4).getContentTex()).contains("## Study limitations");
    }

    @Test
    void promotesInlineAbstractAndPreservesNumberedSections() {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        DocumentText text = new DocumentText();
        text.setDocument(document);
        List<String> headings = List.of(
                "1. Introduction",
                "2. Background",
                "3. Research methodology",
                "4. Results",
                "5. Discussion",
                "6. Conclusion",
                "7. Acknowledgments",
                "8. References",
                "Appendix A",
                "Appendix B",
                "Appendix C",
                "Appendix D");
        text.setExtractedText("""
                # Paper title
                Authors

                Abstract: Abstract body.

                Keywords: AI, ML

                """ + String.join(
                "\n",
                headings.stream().map(title -> "## " + title + "\nBody.").toList()));
        document.setDocumentText(text);

        List<AiModelClient.ExtractionBlock> blocks = new ArrayList<>();
        blocks.add(heading("Paper title", 1));
        headings.forEach(title -> blocks.add(heading(title, 2)));
        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId)).thenReturn(List.of());
        List<PaperSection> saved = new ArrayList<>();
        when(paperSectionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            Iterable<PaperSection> sections = invocation.getArgument(0);
            sections.forEach(saved::add);
            return saved;
        });

        service().detectAndPersistSections(documentId, blocks);

        assertThat(saved).extracting(PaperSection::getSectionTitle)
                .containsExactly(
                        "Abstract",
                        "Introduction",
                        "Background",
                        "Research methodology",
                        "Results",
                        "Discussion",
                        "Conclusion",
                        "Acknowledgments",
                        "References",
                        "Appendix A",
                        "Appendix B",
                        "Appendix C",
                        "Appendix D");
        assertThat(saved.getFirst().getContentTex())
                .isEqualTo("Abstract body.\n\nKeywords: AI, ML");
    }

    private static AiModelClient.ExtractionBlock heading(String text, int level) {
        return new AiModelClient.ExtractionBlock("heading", text, level, null);
    }

    @Test
    void leavesExistingSectionsUntouchedWhenStructuredBlocksAreProvided() {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        PaperSection existing = new PaperSection();
        existing.setDocument(document);
        existing.setSectionTitle("Abstract");

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId))
                .thenReturn(List.of(existing));

        service().detectAndPersistSections(documentId, List.of(heading("Abstract", 2)));

        verify(paperSectionRepository, never()).saveAll(anyList());
    }

    @Test
    void assignSectionMovesCreatedProjectToAssigned() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.CREATED);
        Document paper = paper(project);
        PaperSection section = section(paper);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(userRepository.findById(student.getId())).thenReturn(Optional.of(student));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().assignSection(paper.getId(), section.getId(), student.getId());

        assertThat(section.getAssignedUser()).isEqualTo(student);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ASSIGNED);
        verify(projectRepository).save(project);
    }

    @Test
    void assignSectionKeepsProjectStatusWhenAlreadyAssigned() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(userRepository.findById(student.getId())).thenReturn(Optional.of(student));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().assignSection(paper.getId(), section.getId(), student.getId());

        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ASSIGNED);
        verify(projectRepository, never()).save(project);
    }

    @Test
    void assignedStudentSavingContentMovesAssignedProjectToInProgress() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().updateSection(
                paper.getId(), section.getId(), null, null, null, "draft text", 0L);

        assertThat(section.getContentTex()).isEqualTo("draft text");
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.IN_PROGRESS);
        verify(projectRepository).save(project);
    }

    @Test
    void contentSaveRecordsWordDeltaAsEvidence() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        section.setContentTex("old words");
        section.setVersion(2);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().updateSection(
                paper.getId(), section.getId(), null, null, null,
                "new words plus one", 0L);

        assertThat(section.getPreviousContentTex()).isEqualTo("old words");
        assertThat(section.getVersion()).isEqualTo(3);
        verify(auditService).record(
                "SECTION_CONTENT_UPDATED",
                "PROJECT",
                project.getId(),
                student,
                null,
                Map.of(
                        "sectionId", section.getId(),
                        "sectionTitle", "Intro",
                        "beforeWordCount", 2,
                        "afterWordCount", 4,
                        "wordDelta", 2,
                        "wordsAdded", 3,
                        "wordsRemoved", 1,
                        "contentFingerprint", "ecddccec1117cff2670a3d2cc239b00adec76558d46ee8f5cb78ae82c6f81c57"));
    }

    @Test
    void rollbackRecordsWordDeltaAsEvidence() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        section.setContentTex("current words");
        section.setPreviousContentTex("previous");
        section.setVersion(2);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().rollbackSection(paper.getId(), section.getId(), 0L);

        assertThat(section.getContentTex()).isEqualTo("previous");
        assertThat(section.getPreviousContentTex()).isEqualTo("current words");
        assertThat(section.getVersion()).isEqualTo(3);
        verify(evidenceTraceService).stampStaleOnContentChanged(
                section.getId(), "previous", 3);
        verify(auditService).record(
                "SECTION_CONTENT_UPDATED",
                "PROJECT",
                project.getId(),
                student,
                null,
                Map.of(
                        "sectionId", section.getId(),
                        "sectionTitle", "Intro",
                        "beforeWordCount", 2,
                        "afterWordCount", 1,
                        "wordDelta", -1,
                        "wordsAdded", 1,
                        "wordsRemoved", 2,
                        "contentFingerprint", "6da0633528deaa0144e7b058315f0b753ec0b945163a72bf96a0d18180f9de0d"));
    }

    @Test
    void rollbackRejectsAnIdenticalPreviousSave() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        section.setContentTex("same content");
        section.setPreviousContentTex("same content");
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));

        assertThatThrownBy(() -> service().rollbackSection(
                paper.getId(), section.getId(), 0L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));

        verify(paperSectionRepository, never()).save(section);
    }

    @Test
    void unchangedContentPreservesThePreviousSaveAndVersion() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        section.setContentTex("same content");
        section.setPreviousContentTex("previous content");
        section.setVersion(7);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));

        service().updateSection(
                paper.getId(), section.getId(), null, null, null, "same content", 0L);

        assertThat(section.getPreviousContentTex()).isEqualTo("previous content");
        assertThat(section.getVersion()).isEqualTo(7);
        verify(paperSectionRepository, never()).save(section);
        verifyNoInteractions(evidenceTraceService, auditService);
    }

    @Test
    void staleExpectedRevisionCannotOverwriteSectionContent() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        section.setContentTex("server content");
        section.setOptVersion(4L);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));

        assertThatThrownBy(() -> service().updateSection(
                paper.getId(), section.getId(), null, null, null, "stale edit", 3L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));

        assertThat(section.getContentTex()).isEqualTo("server content");
        verify(paperSectionRepository, never()).save(section);
    }

    @Test
    void emptyUpdateDoesNotMoveAssignedProjectToInProgress() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));

        service().updateSection(
                paper.getId(), section.getId(), null, null, null, null, null);

        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ASSIGNED);
        verify(projectRepository, never()).save(project);
    }

    @Test
    void instructorSavingContentDoesNotMoveAssignedProject() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().updateSection(
                paper.getId(), section.getId(), null, null, null, "instructor edit", 0L);

        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ASSIGNED);
        verify(projectRepository, never()).save(project);
    }

    private PaperProcessingServiceImpl service() {
        return new PaperProcessingServiceImpl(
                paperSectionRepository,
                mock(InstructorFeedbackRepository.class),
                documentRepository,
                currentUserService,
                mock(PaperStandardService.class),
                userRepository,
                projectRepository,
                mock(SystemNotificationService.class),
                mock(TexArchiveBuilder.class),
                evidenceTraceService,
                auditService);
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        user.setEmail(user.getId() + "@example.com");
        return user;
    }

    private Project project(ProjectStatus status) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setStatus(status);
        project.setActive(true);
        return project;
    }

    private Document paper(Project project) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setProject(project);
        document.setProcessingStatus(ProcessingStatus.READY);
        return document;
    }

    private PaperSection section(Document paper) {
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(paper);
        section.setSectionTitle("Intro");
        section.setOptVersion(0L);
        section.setActive(true);
        return section;
    }
}
