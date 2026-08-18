package com.evidencepilot.dto.response;

import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;

import java.time.LocalDateTime;
import java.util.UUID;

public record ProjectMemberResponse(
    UUID id,
    UUID projectId,
    UUID userId,
    String role,
    LocalDateTime joinedAt,
    String firstName,
    String lastName,
    String email,
    String userRole
) {
    public static ProjectMemberResponse from(ProjectMember member) {
        User user = member.getUser();
        return new ProjectMemberResponse(
                member.getId(),
                member.getProject() != null ? member.getProject().getId() : null,
                user != null ? user.getId() : null,
                member.getRole() != null ? member.getRole().name() : null,
                member.getJoinedAt(),
                user != null ? user.getFirstName() : null,
                user != null ? user.getLastName() : null,
                user != null ? user.getEmail() : null,
                user != null && user.getRole() != null ? user.getRole().name() : null);
    }
}
