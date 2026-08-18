package com.evidencepilot.service;

import com.evidencepilot.dto.request.ProjectCreateRequest;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.impl.ProjectServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectServiceImplFlowTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private CurrentUserService currentUserService;

    @Mock
    private SystemNotificationService systemNotificationService;


    @Mock
    private AuditService auditService;

    @Test
    void createProjectRequiresInstructorAndStoresInstructorMembership() {
        User instructor = user(UserRole.INSTRUCTOR);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.save(any(Project.class))).thenAnswer(invocation -> {
            Project project = invocation.getArgument(0);
            project.setId(UUID.randomUUID());
            return project;
        });

        service().createProject(new ProjectCreateRequest("Capstone", null, null));

        verify(currentUserService).requireRole(instructor, UserRole.INSTRUCTOR);
        ArgumentCaptor<ProjectMember> memberCaptor = ArgumentCaptor.forClass(ProjectMember.class);
        verify(projectMemberRepository).save(memberCaptor.capture());
        assertThat(memberCaptor.getValue().getUser()).isEqualTo(instructor);
        assertThat(memberCaptor.getValue().getRole()).isEqualTo(ProjectRole.INSTRUCTOR);
    }

    @Test
    void addMemberAddsStudentAsEditorWithoutInvite() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = projectWithInstructor(instructor);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(userRepository.findById(student.getId())).thenReturn(Optional.of(student));
        when(projectMemberRepository.findByProjectIdAndUserId(project.getId(), student.getId()))
                .thenReturn(List.of());

        service().addMember(project.getId(), student.getId(), null);

        verify(currentUserService).requireProjectManageAccess(instructor, project);
        ArgumentCaptor<ProjectMember> memberCaptor = ArgumentCaptor.forClass(ProjectMember.class);
        verify(projectMemberRepository).save(memberCaptor.capture());
        assertThat(memberCaptor.getValue().getUser()).isEqualTo(student);
        assertThat(memberCaptor.getValue().getRole()).isEqualTo(ProjectRole.MEMBER);
    }

    @Test
    void addMemberRejectsNonStudent() {
        User instructor = user(UserRole.INSTRUCTOR);
        User otherInstructor = user(UserRole.INSTRUCTOR);
        Project project = projectWithInstructor(instructor);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(userRepository.findById(otherInstructor.getId())).thenReturn(Optional.of(otherInstructor));

        assertThatThrownBy(() -> service().addMember(project.getId(), otherInstructor.getId(), ProjectRole.MEMBER))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void getProjectMembersRequiresProjectAccess() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = projectWithInstructor(instructor);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(projectMemberRepository.findByProjectId(project.getId())).thenReturn(List.of());

        service().getProjectMembers(project.getId());

        verify(currentUserService).requireProjectAccess(instructor, project);
    }

    @Test
    void getProjectMemberResponsesMapsMembers() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = projectWithInstructor(instructor);
        ProjectMember member = project.getProjectMembers().get(0);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(projectMemberRepository.findByProjectId(project.getId())).thenReturn(List.of(member));

        var responses = service().getProjectMemberResponses(project.getId());

        assertThat(responses).singleElement().satisfies(response -> {
            assertThat(response.projectId()).isEqualTo(project.getId());
            assertThat(response.userId()).isEqualTo(instructor.getId());
            assertThat(response.role()).isEqualTo(ProjectRole.INSTRUCTOR.name());
            assertThat(response.email()).isEqualTo(instructor.getEmail());
            assertThat(response.userRole()).isEqualTo(UserRole.INSTRUCTOR.name());
        });
    }

    @Test
    void removeMemberNotifiesAndDeletesMatches() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = projectWithInstructor(instructor);
        ProjectMember member = new ProjectMember();
        member.setProject(project);
        member.setUser(student);
        member.setRole(ProjectRole.MEMBER);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(projectMemberRepository.findByProjectIdAndUserId(project.getId(), student.getId()))
                .thenReturn(List.of(member));

        service().removeMember(project.getId(), student.getId());

        verify(systemNotificationService).createNotification(
                student, instructor, "PROJECT_MEMBER_REMOVED", project.getId(),
                instructor.getEmail() + " removed you from project \"" + project.getTitle() + "\".");
        verify(projectMemberRepository).deleteAll(List.of(member));
    }

    private ProjectServiceImpl service() {
        return new ProjectServiceImpl(
                projectRepository,
                projectMemberRepository,
                userRepository,
                currentUserService,
                systemNotificationService,
                auditService);
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(user.getId() + "@example.com");
        user.setRole(role);
        return user;
    }

    private Project projectWithInstructor(User instructor) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Capstone");
        project.setActive(true);

        ProjectMember member = new ProjectMember();
        member.setProject(project);
        member.setUser(instructor);
        member.setRole(ProjectRole.INSTRUCTOR);
        project.setProjectMembers(List.of(member));
        return project;
    }
}
