package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.ProjectCreateRequest;
import com.evidencepilot.dto.request.ProjectUpdateRequest;
import com.evidencepilot.dto.response.PagedResponse;
import com.evidencepilot.dto.response.ProjectMemberResponse;
import com.evidencepilot.dto.response.ProjectResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.AuditService;
import com.evidencepilot.service.ProjectService;
import com.evidencepilot.service.SystemNotificationService;
import com.evidencepilot.dto.request.PagingRequest;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProjectServiceImpl implements ProjectService {

    private static final Set<String> PROJECT_SORT_FIELDS = Set.of(
            "title", "status", "createdAt", "updatedAt");

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final UserRepository userRepository;
    private final CurrentUserService currentUserService;
    private final SystemNotificationService systemNotificationService;
    private final AuditService auditService;

    @Override
    public List<ProjectResponse> getAllProjects() {
        User currentUser = currentUserService.requireCurrentUser();
        return projectMemberRepository.findByUserId(currentUser.getId()).stream()
                .map(ProjectMember::getProject)
                .filter(Project::isActive)
                .map(ProjectResponse::from)
                .toList();
    }

    @Override
    public PagedResponse<ProjectResponse> getAllProjects(
            int page,
            int size,
            String sort,
            String q,
            ProjectStatus status,
            Boolean active) {
        User currentUser = currentUserService.requireCurrentUser();
        var pageable = PagingRequest.pageable(
                page, size, sort, PROJECT_SORT_FIELDS, "createdAt,desc");
        var results = projectRepository.findAll(
                projectSpec(currentUser, q, status, active),
                pageable);
        List<Project> projects = results.getContent();
        List<UUID> projectIds = projects.stream().map(Project::getId).toList();
        List<Object[]> memberCountsRaw = projectMemberRepository.countByProjectIds(projectIds);
        Map<UUID, Long> memberCounts = new java.util.HashMap<>();
        for (Object[] row : memberCountsRaw) {
            memberCounts.put((UUID) row[0], ((Number) row[1]).longValue());
        }
        List<ProjectResponse> responses = projects.stream()
                .map(p -> new ProjectResponse(
                        p.getId(),
                        p.getTitle(),
                        p.getDescription(),
                        p.getStatus(),
                        p.getTargetStandard(),
                        p.getCreatedAt(),
                        p.getUpdatedAt(),
                        null,
                        memberCounts.getOrDefault(p.getId(), 0L)
                ))
                .toList();
        return PagedResponse.from(new org.springframework.data.domain.PageImpl<>(responses, pageable, results.getTotalElements()));
    }

    @Override
    public ProjectResponse getProjectById(UUID id) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = findActiveProject(id);
        currentUserService.requireProjectAccess(currentUser, project);
        return ProjectResponse.from(project, currentUser.getId());
    }

    @Override
    @Transactional
    public ProjectResponse createProject(ProjectCreateRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        currentUserService.requireRole(currentUser, UserRole.INSTRUCTOR);

        Project project = new Project();
        project.setTitle(request.title());
        project.setDescription(request.description());
        project.setTargetStandard(request.targetStandard());
        project.setStatus(ProjectStatus.CREATED);
        project.setCreatedAt(LocalDateTime.now());

        Project saved = projectRepository.save(project);

        ProjectMember owner = new ProjectMember();
        owner.setProject(saved);
        owner.setUser(currentUser);
        owner.setRole(currentUser.getRole() == UserRole.INSTRUCTOR
                ? ProjectRole.INSTRUCTOR
                : ProjectRole.LEADER);
        owner.setJoinedAt(LocalDateTime.now());
        projectMemberRepository.save(owner);

        auditService.record("PROJECT_CREATED", "PROJECT", saved.getId(), currentUser, null, saved.getStatus());
        systemNotificationService.createNotification(
                currentUser,
                currentUser,
                "PROJECT_CREATED",
                saved.getId(),
                "Project \"" + saved.getTitle() + "\" has been created.");

        return ProjectResponse.from(saved);
    }

    @Override
    @Transactional
    public ProjectResponse updateProject(UUID id, ProjectUpdateRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = findActiveProject(id);
        currentUserService.requireProjectManageAccess(currentUser, project);
        currentUserService.requireProjectWriteAccess(currentUser, project);

        String oldTitle = project.getTitle();
        String oldDescription = project.getDescription();
        PaperStandard oldTarget = project.getTargetStandard();

        project.setTitle(request.title());
        project.setDescription(request.description());
        project.setTargetStandard(request.targetStandard());
        project.setUpdatedAt(LocalDateTime.now());

        Project saved = projectRepository.save(project);
        auditService.record("PROJECT_UPDATED", "PROJECT", saved.getId(), currentUser,
                "title=" + oldTitle + ",description=" + oldDescription + ",targetStandard=" + oldTarget,
                "title=" + saved.getTitle() + ",description=" + saved.getDescription() + ",targetStandard=" + saved.getTargetStandard());
        return ProjectResponse.from(saved);
    }

    @Override
    @Transactional
    public ProjectResponse completeProject(UUID id) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = findActiveProject(id);
        currentUserService.requireRole(currentUser, UserRole.INSTRUCTOR);
        currentUserService.requireProjectAccess(currentUser, project);
        if (project.getStatus() != ProjectStatus.IN_PROGRESS
                && project.getStatus() != ProjectStatus.SUBMITTED_FOR_REVIEW
                && project.getStatus() != ProjectStatus.RETURNED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project cannot be completed in its current state.");
        }
        ProjectStatus oldStatus = project.getStatus();
        project.setStatus(ProjectStatus.APPROVED);
        project.setUpdatedAt(LocalDateTime.now());
        Project saved = projectRepository.save(project);
        auditService.record("PROJECT_COMPLETED", "PROJECT", saved.getId(), currentUser,
                oldStatus, ProjectStatus.APPROVED);
        systemNotificationService.createNotification(
                currentUser,
                currentUser,
                "PROJECT_COMPLETED",
                saved.getId(),
                "Project \"" + saved.getTitle() + "\" has been completed.");
        return ProjectResponse.from(saved);
    }

    @Override
    @Transactional
    public ProjectResponse archiveProject(UUID id) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = findActiveProject(id);
        currentUserService.requireProjectManageAccess(currentUser, project);
        if (project.getStatus() != ProjectStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only APPROVED projects can be archived.");
        }
        project.setStatus(ProjectStatus.ARCHIVED);
        project.setUpdatedAt(LocalDateTime.now());
        Project saved = projectRepository.save(project);
        auditService.record(
                "PROJECT_ARCHIVED", "PROJECT", project.getId(), currentUser,
                ProjectStatus.APPROVED, ProjectStatus.ARCHIVED);
        return ProjectResponse.from(saved);
    }

    @Override
    @Transactional
    public ProjectResponse unarchiveProject(UUID id) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = findActiveProject(id);
        currentUserService.requireProjectManageAccess(currentUser, project);
        if (project.getStatus() != ProjectStatus.ARCHIVED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only ARCHIVED projects can be unarchived.");
        }
        project.setStatus(ProjectStatus.APPROVED);
        project.setUpdatedAt(LocalDateTime.now());
        Project saved = projectRepository.save(project);
        auditService.record(
                "PROJECT_UNARCHIVED", "PROJECT", project.getId(), currentUser,
                ProjectStatus.ARCHIVED, ProjectStatus.APPROVED);
        return ProjectResponse.from(saved);
    }

    @Override
    @Transactional
    public void deleteProject(UUID id) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = findActiveProject(id);
        currentUserService.requireProjectManageAccess(currentUser, project);
        currentUserService.requireProjectWriteAccess(currentUser, project);
        project.setActive(false);
        projectRepository.save(project);
        auditService.record("PROJECT_DELETED", "PROJECT", project.getId(), currentUser, null, null);
    }

    @Override
    public List<ProjectMember> getProjectMembers(UUID projectId) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = findActiveProject(projectId);
        currentUserService.requireProjectAccess(currentUser, project);
        return projectMemberRepository.findByProjectId(projectId);
    }

    @Override
    public List<ProjectMemberResponse> getProjectMemberResponses(UUID projectId) {
        return getProjectMembers(projectId).stream()
                .map(ProjectMemberResponse::from)
                .toList();
    }

    @Override
    @Transactional
    public void addMember(UUID projectId, UUID userId, ProjectRole role) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = findActiveProject(projectId);
        currentUserService.requireProjectManageAccess(currentUser, project);
        currentUserService.requireProjectWriteAccess(currentUser, project);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException(userId, "User"));
        if (user.getRole() != UserRole.STUDENT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only students can be added to projects.");
        }
        if (!projectMemberRepository.findByProjectIdAndUserId(projectId, userId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User is already a project member.");
        }
        ProjectRole memberRole = role != null ? role : ProjectRole.MEMBER;
        if (memberRole != ProjectRole.LEADER && memberRole != ProjectRole.MEMBER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Student must be LEADER or MEMBER.");
        }

        ProjectMember member = new ProjectMember();
        member.setProject(project);
        member.setUser(user);
        member.setRole(memberRole);
        member.setJoinedAt(LocalDateTime.now());
        projectMemberRepository.save(member);

        systemNotificationService.createNotification(
                user,
                currentUser,
                "PROJECT_MEMBER_ADDED",
                project.getId(),
                currentUser.getEmail() + " added you to project \"" + project.getTitle() + "\".");
    }

    @Override
    @Transactional
    public void updateMemberRole(UUID projectId, UUID userId, ProjectRole role) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = findActiveProject(projectId);
        currentUserService.requireProjectManageAccess(currentUser, project);
        currentUserService.requireProjectWriteAccess(currentUser, project);

        ProjectMember member = projectMemberRepository.findByProjectIdAndUserId(projectId, userId).stream()
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Project member not found"));
        if (member.getRole() == ProjectRole.INSTRUCTOR) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot change the instructor role.");
        }
        if (role != ProjectRole.LEADER && role != ProjectRole.MEMBER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Student must be LEADER or MEMBER.");
        }
        if (member.getRole() == role) {
            return;
        }
        if (member.getRole() == ProjectRole.LEADER) {
            requireAnotherLeader(projectId);
        }

        member.setRole(role);
        projectMemberRepository.save(member);
        systemNotificationService.createNotification(
                member.getUser(),
                currentUser,
                "PROJECT_MEMBER_ROLE_CHANGED",
                project.getId(),
                currentUser.getEmail() + " changed your role in project \"" + project.getTitle()
                        + "\" to " + role + ".");
    }

    @Override
    @Transactional
    public void removeMember(UUID projectId, UUID userId) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = findActiveProject(projectId);
        currentUserService.requireProjectManageAccess(currentUser, project);
        currentUserService.requireProjectWriteAccess(currentUser, project);
        List<ProjectMember> members = projectMemberRepository.findByProjectIdAndUserId(projectId, userId);
        if (members.isEmpty()) {
            throw new ResourceNotFoundException("Project member not found");
        }
        // DEBT-06: removing the instructor or the last leader leaves the project
        // without its management invariants — refuse before deleting anything.
        ProjectMember target = members.get(0);
        if (target.getRole() == ProjectRole.INSTRUCTOR) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot remove the instructor from the project.");
        }
        if (target.getRole() == ProjectRole.LEADER) {
            requireAnotherLeader(projectId);
        }
        members.forEach(member -> systemNotificationService.createNotification(
                member.getUser(),
                currentUser,
                "PROJECT_MEMBER_REMOVED",
                project.getId(),
                currentUser.getEmail() + " removed you from project \"" + project.getTitle() + "\"."));
        projectMemberRepository.deleteAll(members);
    }

    private void requireAnotherLeader(UUID projectId) {
        long leaderCount = projectMemberRepository.findByProjectId(projectId).stream()
                .filter(member -> member.getRole() == ProjectRole.LEADER)
                .count();
        if (leaderCount <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Project must retain at least one leader.");
        }
    }

    private Project findActiveProject(UUID id) {
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(id, "Project"));
        if (!project.isActive()) {
            throw new ResourceNotFoundException(id, "Project");
        }
        return project;
    }

    private Specification<Project> projectSpec(
            User currentUser,
            String q,
            ProjectStatus status,
            Boolean active) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("active"), active != null ? active : true));

            if (!currentUserService.isAdmin(currentUser)) {
                if (query != null) {
                    query.distinct(true);
                }
                var members = root.join("projectMembers");
                predicates.add(cb.equal(members.get("user").get("id"), currentUser.getId()));
            }

            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }

            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(root.get("description")), like)));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }
}
