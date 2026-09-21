package com.evidencepilot.service.impl;

import com.evidencepilot.exception.ApiException;
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
import com.evidencepilot.service.PaperStandardService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CurrentUserServiceImpl {

    private final UserRepository userRepository;
    private final FeedbackRequestRepository feedbackRequestRepository;
    private final PaperStandardService paperStandardService;

    public User requireCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) {
            throw new ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED,
                    "No authenticated user found");
        }
        if (auth.getPrincipal() instanceof User user) {
            return user;
        }
        String email = auth.getName();
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND,
                        "User not found: " + email));
    }

    public boolean isAdmin(User user) {
        return user.getRole() == UserRole.ADMIN;
    }

    public boolean isInstructor(User user) {
        return user.getRole() == UserRole.INSTRUCTOR;
    }

    public boolean ownsUserIdOrAdmin(User currentUser, UUID userId) {
        return isAdmin(currentUser) || currentUser.getId().equals(userId);
    }

    public void requireRole(User currentUser, UserRole role) {
        if (currentUser.getRole() != role && currentUser.getRole() != UserRole.ADMIN) {
            throw new ApiException(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    ApiException.PROJECT_ROLE_REQUIRED,
                    "Requires role: " + role);
        }
    }

    public void requireUserIdOrAdmin(User currentUser, UUID userId) {
        if (!ownsUserIdOrAdmin(currentUser, userId)) {
            throw new ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    "Access denied: not your resource");
        }
    }

    public void requireProjectAccess(User currentUser, Project project) {
        if (isAdmin(currentUser))
            return;
        if (isInstructor(currentUser)) {
            if (isProjectMember(currentUser, project))
                return;
            if (project.getStatus() == ProjectStatus.SUBMITTED_FOR_REVIEW && project.getId() != null
                    && feedbackRequestRepository.existsByProjectIdAndInstructorId(
                            project.getId(), currentUser.getId())) {
                return;
            }
            throw new ApiException(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    ApiException.PROJECT_MEMBERSHIP_REQUIRED,
                    "Instructor access denied to project");
        }
        if (!isProjectMember(currentUser, project)) {
            throw new ApiException(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    ApiException.PROJECT_MEMBERSHIP_REQUIRED,
                    "Project access denied");
        }
    }

    public void requireProjectWriteAccess(User currentUser, Project project) {
        if (project.getStatus().isReadOnly()) {
            throw new ApiException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    ApiException.PROJECT_TRANSITION_INVALID,
                    "Project is read-only.");
        }
        if (isAdmin(currentUser))
            return;
        if (project.getStatus() == ProjectStatus.SUBMITTED_FOR_REVIEW) {
            throw new ApiException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    ApiException.PROJECT_TRANSITION_INVALID,
                    "Project is locked and cannot be modified.");
        }
        if (!isProjectMember(currentUser, project)) {
            throw new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,
                    ApiException.PROJECT_MEMBERSHIP_REQUIRED, "Project access denied");
        }
        if (!hasProjectRole(currentUser, project, Set.of(
                ProjectRole.LEADER, ProjectRole.MEMBER, ProjectRole.INSTRUCTOR))) {
            throw new ApiException(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    ApiException.PROJECT_ROLE_REQUIRED,
                    "Write access denied to project");
        }
    }

    public void requireProjectManageAccess(User currentUser, Project project) {
        if (isAdmin(currentUser))
            return;
        if (!isProjectMember(currentUser, project)) {
            throw new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,
                    ApiException.PROJECT_MEMBERSHIP_REQUIRED, "Project access denied");
        }
        if (!hasProjectRole(currentUser, project, Set.of(ProjectRole.INSTRUCTOR, ProjectRole.LEADER))) {
            throw new ApiException(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    ApiException.PROJECT_ROLE_REQUIRED,
                    "Project management access denied");
        }
    }

    /**
     * Evidence-trace judgments are instructor review actions, not project writes:
     * they must work while the project is locked (SUBMITTED_FOR_REVIEW), matching
     * the read access the GET list endpoint already grants for the review phase.
     */
    public void requireEvidenceTraceReviewAccess(User currentUser, Project project) {
        if (isAdmin(currentUser))
            return;
        if (!isInstructor(currentUser)) {
            throw new ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    "Only instructors can review evidence traces");
        }
        if (isProjectMember(currentUser, project))
            return;
        if (project.getStatus() == ProjectStatus.SUBMITTED_FOR_REVIEW && project.getId() != null
                && feedbackRequestRepository.existsByProjectIdAndInstructorId(
                        project.getId(), currentUser.getId())) {
            return;
        }
        throw new ApiException(
                org.springframework.http.HttpStatus.FORBIDDEN,
                ApiException.PROJECT_MEMBERSHIP_REQUIRED,
                "Instructor access denied to project");
    }

    private boolean isProjectMember(User currentUser, Project project) {
        if (project.getProjectMembers() == null) {
            return false;
        }
        return project.getProjectMembers().stream()
                .map(ProjectMember::getUser)
                .anyMatch(user -> user != null && currentUser.getId().equals(user.getId()));
    }

    private boolean hasProjectRole(User currentUser, Project project, Set<ProjectRole> roles) {
        if (project.getProjectMembers() == null) {
            return false;
        }
        return project.getProjectMembers().stream()
                .anyMatch(pm -> pm.getUser() != null
                        && currentUser.getId().equals(pm.getUser().getId())
                        && roles.contains(pm.getRole()));
    }

    public void requireCollectionAccess(User currentUser, com.evidencepilot.model.Collection collection) {
        if (isAdmin(currentUser))
            return;
        if (isInstructor(currentUser)) {
            if (!collection.getInstructor().getId().equals(currentUser.getId())) {
                throw new ResponseStatusException(
                        org.springframework.http.HttpStatus.FORBIDDEN,
                        "Instructor access denied to collection");
            }
            return;
        }
        throw new ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN,
                "Students cannot access collections");
    }

    public void requireSectionAssignment(User currentUser, PaperSection section) {
        if (currentUser.getRole() != UserRole.STUDENT
                || section.getAssignedUser() == null
                || !currentUser.getId().equals(section.getAssignedUser().getId())) {
            throw new ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN,
                    "Only the assigned student can edit this section");
        }
    }

    public void requireSectionContentWriteAccess(User currentUser, PaperSection section) {
        requireProjectWriteAccess(currentUser, section.getDocument().getProject());
        if (!section.isActive()) {
            throw new ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "Section is inactive.");
        }
        if (isAdmin(currentUser) || isInstructor(currentUser)) {
            return;
        }
        if (section.getSectionType() == PaperSectionType.REFERENCE
                && currentUser.getRole() == UserRole.STUDENT
                && currentUser.getAccountStatus() == AccountStatus.ACTIVE
                && hasProjectRole(currentUser, section.getDocument().getProject(),
                        Set.of(ProjectRole.LEADER, ProjectRole.MEMBER))) {
            return;
        }
        requireSectionAssignment(currentUser, section);
    }
}
