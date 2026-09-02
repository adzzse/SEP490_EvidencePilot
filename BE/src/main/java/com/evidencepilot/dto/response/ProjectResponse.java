package com.evidencepilot.dto.response;

import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.enums.ProjectStatus;
import java.time.LocalDateTime;
import java.util.UUID;

public record ProjectResponse(
    UUID id,
    String title,
    String description,
    ProjectStatus status,
    PaperStandard targetStandard,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    String currentUserRole,
    long memberCount
) {
    public static ProjectResponse from(Project project) {
        return new ProjectResponse(
            project.getId(),
            project.getTitle(),
            project.getDescription(),
            project.getStatus(),
            project.getTargetStandard(),
            project.getCreatedAt(),
            project.getUpdatedAt(),
            null,
            project.getProjectMembers() != null ? project.getProjectMembers().size() : 0
        );
    }

    public static ProjectResponse from(Project project, String currentUserRole) {
        return new ProjectResponse(
            project.getId(),
            project.getTitle(),
            project.getDescription(),
            project.getStatus(),
            project.getTargetStandard(),
            project.getCreatedAt(),
            project.getUpdatedAt(),
            currentUserRole,
            project.getProjectMembers() != null ? project.getProjectMembers().size() : 0
        );
    }

    public static ProjectResponse from(Project project, java.util.UUID currentUserId) {
        String role = null;
        if (project.getProjectMembers() != null && currentUserId != null) {
            role = project.getProjectMembers().stream()
                .filter(pm -> pm.getUser() != null && currentUserId.equals(pm.getUser().getId()))
                .map(ProjectMember::getRole)
                .map(java.util.Objects::toString)
                .findFirst().orElse(null);
        }
        return from(project, role);
    }
}
