package com.evidencepilot.dto.response;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;

import java.time.LocalDateTime;
import java.util.UUID;

public record AdminUserResponse(
        UUID id,
        String email,
        UserRole role,
        AccountStatus accountStatus,
        String studentCode,
        String firstName,
        String lastName,
        LocalDateTime createdAt,
        String avatarUrl) {

    public static AdminUserResponse from(User user) {
        return from(user, null);
    }

    public static AdminUserResponse from(User user, String avatarUrl) {
        return new AdminUserResponse(user.getId(), user.getEmail(), user.getRole(), user.getAccountStatus(),
                user.getStudentCode(), user.getFirstName(), user.getLastName(), user.getCreatedAt(), avatarUrl);
    }
}
