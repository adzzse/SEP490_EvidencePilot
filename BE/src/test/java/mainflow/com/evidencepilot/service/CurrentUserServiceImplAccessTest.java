package com.evidencepilot.service;

import com.evidencepilot.exception.ApiException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.PaperSectionType;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ExtendWith(MockitoExtension.class)
class CurrentUserServiceImplAccessTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private FeedbackRequestRepository feedbackRequestRepository;

    @Mock
    private PaperStandardService paperStandardService;

    private CurrentUserServiceImpl currentUserService;

    @BeforeEach
    void setUp() {
        currentUserService = new CurrentUserServiceImpl(userRepository, feedbackRequestRepository, paperStandardService);
    }

    @Test
    void scheduledProjectRejectsStudentAndAdministratorWriteAccess() {
        Project project = project(ProjectStatus.IN_PROGRESS);
        project.setDeletionScheduledAt(LocalDateTime.now().plusDays(30));

        User student = user(UserRole.STUDENT);
        addMember(project, student, ProjectRole.MEMBER);

        User admin = user(UserRole.ADMIN);

        assertThatThrownBy(() -> currentUserService.requireProjectWriteAccess(student, project))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("scheduled for deletion");

        assertThatThrownBy(() -> currentUserService.requireProjectWriteAccess(admin, project))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("scheduled for deletion");
    }

    @Test
    void scheduledProjectAllowsReadAccess() {
        Project project = project(ProjectStatus.IN_PROGRESS);
        project.setDeletionScheduledAt(LocalDateTime.now().plusDays(30));

        User student = user(UserRole.STUDENT);
        addMember(project, student, ProjectRole.MEMBER);

        assertThatCode(() -> currentUserService.requireProjectAccess(student, project))
                .doesNotThrowAnyException();
    }

    @Test
    void scheduledProjectAllowsSectionContentReadAccessToAssignedStudent() {
        Project project = project(ProjectStatus.IN_PROGRESS);
        project.setDeletionScheduledAt(LocalDateTime.now().plusDays(30));

        User student = user(UserRole.STUDENT);
        addMember(project, student, ProjectRole.MEMBER);

        Document paper = new Document();
        paper.setId(UUID.randomUUID());
        paper.setProject(project);

        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(paper);
        section.setActive(true);
        section.setSectionType(PaperSectionType.STANDARD);
        section.setAssignedUser(student);

        assertThatCode(() -> currentUserService.requireSectionContentReadAccess(student, section))
                .doesNotThrowAnyException();
    }

    @Test
    void requireProjectMutationAllowedThrows409WhenDeletionScheduled() {
        Project project = project(ProjectStatus.IN_PROGRESS);
        project.setDeletionScheduledAt(LocalDateTime.now().plusDays(30));

        assertThatThrownBy(() -> currentUserService.requireProjectMutationAllowed(project))
                .isInstanceOf(ApiException.class)
                .matches(e -> ((ApiException) e).getStatusCode().value() == HttpStatus.CONFLICT.value())
                .hasMessageContaining("scheduled for deletion");
    }

    @Test
    void requireProjectMutationAllowedAllowsWhenNotScheduled() {
        Project project = project(ProjectStatus.IN_PROGRESS);
        project.setDeletionScheduledAt(null);

        assertThatCode(() -> currentUserService.requireProjectMutationAllowed(project))
                .doesNotThrowAnyException();
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(role.name().toLowerCase() + "@test.com");
        user.setRole(role);
        user.setAccountStatus(AccountStatus.ACTIVE);
        return user;
    }

    private Project project(ProjectStatus status) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Test Project");
        project.setStatus(status);
        project.setActive(true);
        return project;
    }

    private void addMember(Project project, User user, ProjectRole role) {
        ProjectMember member = new ProjectMember();
        member.setId(UUID.randomUUID());
        member.setProject(project);
        member.setUser(user);
        member.setRole(role);
        project.setProjectMembers(List.of(member));
    }
}
