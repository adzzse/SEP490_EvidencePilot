package com.evidencepilot.service;

import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class CurrentUserServiceImplTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private FeedbackRequestRepository feedbackRequestRepository;

    @Test
    void requireProjectAccessAllowsAssignedInstructorDuringReview() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = projectOwnedBy(user(UserRole.STUDENT));
        project.setStatus(ProjectStatus.SUBMITTED_FOR_REVIEW);

        when(feedbackRequestRepository.existsByProjectIdAndInstructorId(
                project.getId(), instructor.getId())).thenReturn(true);

        CurrentUserServiceImpl service =
                new CurrentUserServiceImpl(userRepository, feedbackRequestRepository);

        assertThatCode(() -> service.requireProjectAccess(instructor, project))
                .doesNotThrowAnyException();
    }

    @Test
    void requireProjectWriteAccessAllowsInstructorMember() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = projectWithMembers(member(instructor, ProjectRole.INSTRUCTOR));

        CurrentUserServiceImpl service =
                new CurrentUserServiceImpl(userRepository, feedbackRequestRepository);

        assertThatCode(() -> service.requireProjectWriteAccess(instructor, project))
                .doesNotThrowAnyException();
    }

    @Test
    void requireProjectWriteAccessAllowsStudentEditor() {
        User student = user(UserRole.STUDENT);
        Project project = projectWithMembers(member(student, ProjectRole.MEMBER));

        CurrentUserServiceImpl service =
                new CurrentUserServiceImpl(userRepository, feedbackRequestRepository);

        assertThatCode(() -> service.requireProjectWriteAccess(student, project))
                .doesNotThrowAnyException();
    }

    @Test
    void sectionContentWriteFollowsAssignmentAndRejectsInstructor() {
        User assigned = user(UserRole.STUDENT);
        User otherStudent = user(UserRole.STUDENT);
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = projectWithMembers(
                member(assigned, ProjectRole.MEMBER),
                member(otherStudent, ProjectRole.MEMBER),
                member(instructor, ProjectRole.INSTRUCTOR));
        Document document = new Document();
        document.setProject(project);
        PaperSection section = new PaperSection();
        section.setDocument(document);
        section.setAssignedUser(assigned);

        assertThatCode(() -> service().requireSectionContentWriteAccess(assigned, section))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> service().requireSectionContentWriteAccess(otherStudent, section))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> service().requireSectionContentWriteAccess(instructor, section))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));

        section.setAssignedUser(null);
        assertThatThrownBy(() -> service().requireSectionContentWriteAccess(otherStudent, section))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void requireProjectManageAccessRejectsStudentEditor() {
        User student = user(UserRole.STUDENT);
        Project project = projectWithMembers(member(student, ProjectRole.MEMBER));
        project.setStatus(ProjectStatus.APPROVED);

        CurrentUserServiceImpl service =
                new CurrentUserServiceImpl(userRepository, feedbackRequestRepository);

        assertThatThrownBy(() -> service.requireProjectManageAccess(student, project))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void requireProjectManageAccessAllowsAdminInstructorAndOwnerWithoutLifecycleLock() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = projectWithMembers(member(instructor, ProjectRole.INSTRUCTOR));
        project.setStatus(ProjectStatus.APPROVED);

        assertThatCode(() -> service().requireProjectManageAccess(instructor, project))
                .doesNotThrowAnyException();

        project.setStatus(ProjectStatus.ARCHIVED);
        assertThatCode(() -> service().requireProjectManageAccess(instructor, project))
                .doesNotThrowAnyException();

        User owner = user(UserRole.STUDENT);
        Project ownedProject = projectWithMembers(member(owner, ProjectRole.LEADER));
        ownedProject.setStatus(ProjectStatus.ARCHIVED);
        assertThatCode(() -> service().requireProjectManageAccess(owner, ownedProject))
                .doesNotThrowAnyException();

        assertThatCode(() -> service().requireProjectManageAccess(
                user(UserRole.ADMIN), projectWithMembers()))
                .doesNotThrowAnyException();
    }

    @Test
    void requireProjectManageAccessRejectsUnrelatedInstructor() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = projectWithMembers(member(user(UserRole.INSTRUCTOR), ProjectRole.INSTRUCTOR));
        project.setStatus(ProjectStatus.ARCHIVED);

        assertThatThrownBy(() -> service().requireProjectManageAccess(instructor, project))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void projectWriteAccessLocksReadOnlyStatusesForAdmin() {
        User admin = user(UserRole.ADMIN);
        Project project = projectWithMembers();

        project.setStatus(ProjectStatus.APPROVED);
        assertThatThrownBy(() -> service().requireProjectWriteAccess(admin, project))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));

        project.setStatus(ProjectStatus.ARCHIVED);
        assertThatThrownBy(() -> service().requireProjectWriteAccess(admin, project))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void submittedProjectWriteAccessAllowsAdminButLocksNonAdminMember() {
        User admin = user(UserRole.ADMIN);
        User editor = user(UserRole.STUDENT);
        Project project = projectWithMembers(member(editor, ProjectRole.MEMBER));
        project.setStatus(ProjectStatus.SUBMITTED_FOR_REVIEW);

        assertThatCode(() -> service().requireProjectWriteAccess(admin, project))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> service().requireProjectWriteAccess(editor, project))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void evidenceTraceReviewAllowsAssignedInstructorWhileLocked() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = projectOwnedBy(user(UserRole.STUDENT));
        project.setStatus(ProjectStatus.SUBMITTED_FOR_REVIEW);
        when(feedbackRequestRepository.existsByProjectIdAndInstructorId(
                project.getId(), instructor.getId())).thenReturn(true);

        assertThatCode(() -> service().requireEvidenceTraceReviewAccess(instructor, project))
                .doesNotThrowAnyException();
    }

    @Test
    void evidenceTraceReviewAllowsInstructorMember() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = projectWithMembers(member(instructor, ProjectRole.INSTRUCTOR));
        project.setStatus(ProjectStatus.SUBMITTED_FOR_REVIEW);

        assertThatCode(() -> service().requireEvidenceTraceReviewAccess(instructor, project))
                .doesNotThrowAnyException();
    }

    @Test
    void evidenceTraceReviewRejectsStudent() {
        User student = user(UserRole.STUDENT);
        Project project = projectWithMembers(member(student, ProjectRole.MEMBER));

        assertThatThrownBy(() -> service().requireEvidenceTraceReviewAccess(student, project))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void evidenceTraceReviewRejectsUnrelatedInstructor() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = projectWithMembers(member(user(UserRole.INSTRUCTOR), ProjectRole.INSTRUCTOR));

        assertThatThrownBy(() -> service().requireEvidenceTraceReviewAccess(instructor, project))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void requireCurrentUserReturnsUserPrincipalOrLoadsByEmail() {
        CurrentUserServiceImpl service = service();
        User principal = user(UserRole.STUDENT);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null));
        assertThat(service.requireCurrentUser()).isSameAs(principal);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("student@test.com", null));
        when(userRepository.findByEmail("student@test.com")).thenReturn(Optional.of(principal));
        assertThat(service.requireCurrentUser()).isSameAs(principal);
        SecurityContextHolder.clearContext();
    }

    @Test
    void requireCurrentUserRejectsMissingAuthentication() {
        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> service().requireCurrentUser())
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    void roleAndUserOwnershipChecksAllowAdminAndOwner() {
        CurrentUserServiceImpl service = service();
        User admin = user(UserRole.ADMIN);
        User student = user(UserRole.STUDENT);

        assertThat(service.isAdmin(admin)).isTrue();
        assertThat(service.isInstructor(user(UserRole.INSTRUCTOR))).isTrue();
        assertThat(service.ownsUserIdOrAdmin(student, student.getId())).isTrue();
        assertThatCode(() -> service.requireRole(admin, UserRole.INSTRUCTOR)).doesNotThrowAnyException();
        assertThatCode(() -> service.requireUserIdOrAdmin(admin, UUID.randomUUID())).doesNotThrowAnyException();
    }

    @Test
    void requireCollectionAccessAllowsOwnerInstructorAndRejectsStudent() {
        User instructor = user(UserRole.INSTRUCTOR);
        com.evidencepilot.model.Collection collection = new com.evidencepilot.model.Collection();
        collection.setInstructor(instructor);

        assertThatCode(() -> service().requireCollectionAccess(instructor, collection)).doesNotThrowAnyException();
        assertThatThrownBy(() -> service().requireCollectionAccess(user(UserRole.STUDENT), collection))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Students");
    }

    @Test
    void requireProjectAccessAllowsStudentMember() {
        User student = user(UserRole.STUDENT);
        Project project = projectOwnedBy(student);

        assertThatCode(() -> service().requireProjectAccess(student, project)).doesNotThrowAnyException();
    }

    private CurrentUserServiceImpl service() {
        return new CurrentUserServiceImpl(userRepository, feedbackRequestRepository);
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        user.setEmail(user.getId() + "@example.com");
        return user;
    }

    private Project projectOwnedBy(User owner) {
        return projectWithMembers(member(owner, ProjectRole.LEADER));
    }

    private Project projectWithMembers(ProjectMember... members) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setStatus(ProjectStatus.ASSIGNED);
        project.setActive(true);
        project.setProjectMembers(List.of(members));
        project.getProjectMembers().forEach(member -> member.setProject(project));
        return project;
    }

    private ProjectMember member(User user, ProjectRole role) {
        ProjectMember member = new ProjectMember();
        member.setUser(user);
        member.setRole(role);
        return member;
    }
}
