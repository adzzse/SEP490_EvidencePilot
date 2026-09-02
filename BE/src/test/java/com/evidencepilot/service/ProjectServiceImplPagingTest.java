package com.evidencepilot.service;

import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ProjectStatus;
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
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectServiceImplPagingTest {

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
    void getAllProjectsReturnsPagedMetadataAndWhitelistedSort() {
        User admin = new User();
        admin.setId(UUID.randomUUID());
        admin.setRole(UserRole.ADMIN);

        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Evidence Search");
        project.setStatus(ProjectStatus.ASSIGNED);
        project.setActive(true);
        project.setCreatedAt(LocalDateTime.now());

        when(currentUserService.requireCurrentUser()).thenReturn(admin);
        when(projectRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(
                        List.of(project),
                        PageRequest.of(1, 2, Sort.by(Sort.Direction.ASC, "title")),
                        3));
        when(projectMemberRepository.countByProjectIds(List.of(project.getId())))
                .thenReturn(List.<Object[]>of(new Object[]{project.getId(), 2L}));

        ProjectServiceImpl service = new ProjectServiceImpl(
                projectRepository,
                projectMemberRepository,
                userRepository,
                currentUserService,
                systemNotificationService,
                auditService);

        var response = service.getAllProjects(
                1,
                2,
                "title,asc",
                "search",
                ProjectStatus.ASSIGNED,
                true);

        assertThat(response.content()).hasSize(1);
        assertThat(response.content().getFirst().title()).isEqualTo("Evidence Search");
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(2);
        assertThat(response.totalElements()).isEqualTo(3);
        assertThat(response.totalPages()).isEqualTo(2);
        assertThat(response.content().getFirst().memberCount()).isEqualTo(2L);

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(projectRepository).findAll(any(Specification.class), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getSort().getOrderFor("title"))
                .extracting(Sort.Order::getDirection)
                .isEqualTo(Sort.Direction.ASC);
    }

    @Test
    void getAllProjectsSkipsMemberCountQueryForEmptyPage() {
        User admin = new User();
        admin.setId(UUID.randomUUID());
        admin.setRole(UserRole.ADMIN);
        when(currentUserService.requireCurrentUser()).thenReturn(admin);
        when(projectRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 10), 0));
        ProjectServiceImpl service = new ProjectServiceImpl(
                projectRepository,
                projectMemberRepository,
                userRepository,
                currentUserService,
                systemNotificationService,
                auditService);

        var response = service.getAllProjects(0, 10, "createdAt,desc", null, null, null);

        assertThat(response.content()).isEmpty();
        verify(projectMemberRepository, never()).countByProjectIds(any());
    }
}
