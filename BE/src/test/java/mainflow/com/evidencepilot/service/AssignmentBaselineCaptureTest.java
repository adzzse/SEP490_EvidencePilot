package com.evidencepilot.service;

import com.evidencepilot.dto.request.SectionBatchItem;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.AssignmentSectionBaselineRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.SectionStandardEvaluationRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.impl.BlockTreeIngestor;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.service.impl.EvidenceTraceService;
import com.evidencepilot.service.impl.PaperProcessingServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * First-handoff baseline capture: one immutable row per (project, section),
 * written on assignment, never on reassignment/unassign/member changes.
 */
@ExtendWith(MockitoExtension.class)
class AssignmentBaselineCaptureTest {

    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private PaperSectionRepository paperSectionRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private CurrentUserServiceImpl currentUserService;
    @Mock
    private AuditService auditService;
    @Mock
    private EvidenceTraceService evidenceTraceService;
    @Mock
    private SectionStandardEvaluationRepository sectionStandardEvaluationRepository;
    @Mock
    private FeedbackAnchorService feedbackAnchorService;
    @Mock
    private AssignmentSectionBaselineRepository baselineRepository;

    @Test
    void assignSectionCapturesBaselineOnce() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.CREATED);
        Document paper = paper(project);
        PaperSection section = section(paper, "Machine learning systems require testing.", 1);
        stubAssign(instructor, student, paper, section);
        when(baselineRepository.existsByProjectIdAndSectionId(project.getId(), section.getId()))
                .thenReturn(false);

        service().assignSection(paper.getId(), section.getId(), student.getId());

        var captor = ArgumentCaptor.forClass(com.evidencepilot.model.AssignmentSectionBaseline.class);
        verify(baselineRepository).save(captor.capture());
        assertThat(captor.getValue().getProject()).isEqualTo(project);
        assertThat(captor.getValue().getSection()).isEqualTo(section);
        assertThat(captor.getValue().getContentTex())
                .isEqualTo("Machine learning systems require testing.");
        assertThat(captor.getValue().getContentVersion()).isEqualTo(1);
        assertThat(captor.getValue().getCreatedAt()).isNotNull();
    }

    @Test
    void reassignmentDoesNotAlterBaseline() {
        User instructor = user(UserRole.INSTRUCTOR);
        User first = user(UserRole.STUDENT);
        User second = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper, "Original handoff text.", 2);
        section.setAssignedUser(first);
        stubAssign(instructor, second, paper, section);
        when(baselineRepository.existsByProjectIdAndSectionId(project.getId(), section.getId()))
                .thenReturn(true);

        service().assignSection(paper.getId(), section.getId(), second.getId());

        assertThat(section.getAssignedUser()).isEqualTo(second);
        verify(baselineRepository, never()).save(any());
    }

    @Test
    void unassignWritesNoBaseline() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper, "Original handoff text.", 2);
        section.setAssignedUser(student);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().assignSection(paper.getId(), section.getId(), null);

        assertThat(section.getAssignedUser()).isNull();
        verify(baselineRepository, never()).save(any());
        verify(baselineRepository, never()).delete(any());
    }

    @Test
    void batchAssignCapturesOnlyNewlyAssignedSections() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.CREATED);
        Document paper = paper(project);
        PaperSection fresh = section(paper, "Fresh section text.", 1);
        PaperSection already = section(paper, "Earlier handoff text.", 3);
        already.setSectionTitle("Earlier");
        already.setSectionOrder(1);
        already.setAssignedUser(student);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(fresh, already));
        when(userRepository.findById(student.getId())).thenReturn(Optional.of(student));
        when(baselineRepository.existsByProjectIdAndSectionId(project.getId(), fresh.getId()))
                .thenReturn(false);
        org.mockito.Mockito.lenient().when(
                baselineRepository.existsByProjectIdAndSectionId(project.getId(), already.getId()))
                .thenReturn(true);

        service().batchUpdateSections(paper.getId(), List.of(
                new SectionBatchItem(fresh.getId(), 0, "Intro", student.getId(), null, 0L),
                new SectionBatchItem(already.getId(), 1, "Earlier", student.getId(), null, 0L)));

        var captor = ArgumentCaptor.forClass(com.evidencepilot.model.AssignmentSectionBaseline.class);
        verify(baselineRepository).save(captor.capture());
        assertThat(captor.getValue().getSection()).isEqualTo(fresh);
        assertThat(captor.getValue().getContentTex()).isEqualTo("Fresh section text.");
    }

    @Test
    void duplicateCaptureIsSwallowed() {
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper, "Racy text.", 1);
        when(baselineRepository.existsByProjectIdAndSectionId(project.getId(), section.getId()))
                .thenReturn(false);
        when(baselineRepository.save(any()))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException("uq_asb_project_section"));

        service().captureInitialBaseline(project, section, java.time.LocalDateTime.now());

        verify(baselineRepository).save(any());
    }

    private void stubAssign(User instructor, User student, Document paper, PaperSection section) {
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(userRepository.findById(student.getId())).thenReturn(Optional.of(student));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);
    }

    private PaperProcessingServiceImpl service() {
        return new PaperProcessingServiceImpl(
                paperSectionRepository,
                mock(com.evidencepilot.repository.DocumentMetadataRepository.class),
                new BlockTreeIngestor(new com.fasterxml.jackson.databind.ObjectMapper()),
                mock(InstructorFeedbackRepository.class),
                documentRepository,
                currentUserService,
                mock(PaperStandardService.class),
                userRepository,
                projectRepository,
                mock(SystemNotificationService.class),
                mock(TexArchiveBuilder.class),
                evidenceTraceService,
                auditService,
                sectionStandardEvaluationRepository,
                feedbackAnchorService,
                baselineRepository,
                new com.fasterxml.jackson.databind.ObjectMapper());
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

    private PaperSection section(Document paper, String contentTex, int version) {
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(paper);
        section.setSectionTitle("Intro");
        section.setSectionOrder(0);
        section.setContentTex(contentTex);
        section.setVersion(version);
        section.setOptVersion(0L);
        section.setActive(true);
        return section;
    }
}
