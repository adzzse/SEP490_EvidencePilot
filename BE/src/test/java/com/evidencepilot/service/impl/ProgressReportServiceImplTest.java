package com.evidencepilot.service.impl;

import com.evidencepilot.model.AuditLog;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.AuditLogRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CurrentUserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProgressReportServiceImplTest {

    @Mock private ProjectRepository projectRepository;
    @Mock private DocumentRepository documentRepository;
    @Mock private PaperSectionRepository paperSectionRepository;
    @Mock private InstructorFeedbackRepository instructorFeedbackRepository;
    @Mock private ProjectMemberRepository projectMemberRepository;
    @Mock private AuditLogRepository auditLogRepository;
    @Mock private CurrentUserService currentUserService;

    private ProgressReportServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new ProgressReportServiceImpl(
                projectRepository,
                documentRepository,
                paperSectionRepository,
                instructorFeedbackRepository,
                projectMemberRepository,
                auditLogRepository,
                currentUserService,
                new ObjectMapper());
    }

    @Test
    void keepsEditHistoryWithTheEditorAfterSectionReassignment() {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setActive(true);
        User instructor = user(UserRole.INSTRUCTOR, "Instructor");
        User previousAssignee = user(UserRole.STUDENT, "Previous");
        User currentAssignee = user(UserRole.STUDENT, "Current");
        User idleStudent = user(UserRole.STUDENT, "Idle");

        Document paper = new Document();
        paper.setId(UUID.randomUUID());
        paper.setProject(project);
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(paper);
        section.setSectionTitle("Introduction");
        section.setContentTex("three current words");
        section.setAssignedUser(currentAssignee);
        section.setVersion(2);
        section.setUpdatedAt(LocalDateTime.now());
        section.setActive(true);

        AuditLog edit = new AuditLog();
        edit.setActor(previousAssignee);
        edit.setNewValue("{\"wordDelta\":2,\"sectionTitle\":\"Introduction\"}");
        edit.setOccurredAt(LocalDateTime.now().minusDays(1));
        LocalDate from = LocalDate.now().minusDays(7);
        LocalDate to = LocalDate.now();

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(
                project.getId(), DocumentType.PAPER)).thenReturn(List.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));
        when(instructorFeedbackRepository.findByRequestProjectId(project.getId()))
                .thenReturn(List.of());
        when(projectMemberRepository.findByProjectId(project.getId()))
                .thenReturn(List.of(
                        member(project, previousAssignee),
                        member(project, currentAssignee),
                        member(project, idleStudent)));
        when(auditLogRepository.findProjectEditsWithin(
                project.getId(), from.atStartOfDay(), to.plusDays(1).atStartOfDay()))
                .thenReturn(List.of(edit));

        var report = service.getProgressReport(project.getId(), "ALL", from, to);

        assertThat(report.sections()).singleElement().satisfies(panel -> {
            assertThat(panel.assignedUserId()).isEqualTo(currentAssignee.getId());
            assertThat(panel.wordCount()).isEqualTo(3);
        });
        assertThat(report.contributions()).hasSize(3);
        assertThat(report.contributions().stream()
                .filter(item -> item.userId().equals(previousAssignee.getId()))
                .findFirst().orElseThrow()).satisfies(item -> {
                    assertThat(item.assignedSectionCount()).isZero();
                    assertThat(item.currentWordCount()).isZero();
                    assertThat(item.saveCount()).isEqualTo(1);
                    assertThat(item.wordDelta()).isEqualTo(2);
                    assertThat(item.wordsAdded()).isEqualTo(2);
                    assertThat(item.wordsRemoved()).isZero();
                    assertThat(item.editedSections()).containsExactly("Introduction");
                    assertThat(item.dailyWordDeltas()).singleElement().satisfies(day -> {
                        assertThat(day.saveCount()).isEqualTo(1);
                        assertThat(day.wordDelta()).isEqualTo(2);
                        assertThat(day.wordsAdded()).isEqualTo(2);
                        assertThat(day.wordsRemoved()).isZero();
                    });
                });
        assertThat(report.contributions().stream()
                .filter(item -> item.userId().equals(currentAssignee.getId()))
                .findFirst().orElseThrow()).satisfies(item -> {
                    assertThat(item.assignedSectionCount()).isEqualTo(1);
                    assertThat(item.currentWordCount()).isEqualTo(3);
                    assertThat(item.saveCount()).isZero();
                });
        assertThat(report.contributions().stream()
                .filter(item -> item.userId().equals(idleStudent.getId()))
                .findFirst().orElseThrow()).satisfies(item -> {
                    assertThat(item.assignedSectionCount()).isZero();
                    assertThat(item.saveCount()).isZero();
                });
        verify(auditLogRepository).findProjectEditsWithin(
                project.getId(), from.atStartOfDay(), to.plusDays(1).atStartOfDay());
    }

    @Test
    void rejectsIncompleteOrReversedDateRange() {
        LocalDate today = LocalDate.now();

        assertThatThrownBy(() -> service.getProgressReport(
                UUID.randomUUID(), "ALL", today, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Provide both from and to");
        assertThatThrownBy(() -> service.getProgressReport(
                UUID.randomUUID(), "ALL", today, today.minusDays(1)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("from on or before to");
    }

    private static ProjectMember member(Project project, User user) {
        ProjectMember member = new ProjectMember();
        member.setId(UUID.randomUUID());
        member.setProject(project);
        member.setUser(user);
        return member;
    }

    private static User user(UserRole role, String name) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        user.setFirstName(name);
        user.setEmail(name.toLowerCase() + "@example.com");
        return user;
    }
}
