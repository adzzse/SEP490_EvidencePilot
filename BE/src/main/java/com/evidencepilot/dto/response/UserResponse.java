package com.evidencepilot.dto.response;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import lombok.Builder;
import lombok.Getter;
import java.util.UUID;

@Getter
@Builder
public class UserResponse {
    private final UUID id;
    private final String email;
    private final UserRole role;
    private final String studentCode;
    private final String firstName;
    private final String lastName;
    private final String avatarUrl;

    public static UserResponse from(User user) {
        return from(user, null);
    }

    public static UserResponse withAvatarUrl(UserResponse base, String avatarUrl) {
        return UserResponse.builder()
                .id(base.getId())
                .email(base.getEmail())
                .role(base.getRole())
                .studentCode(base.getStudentCode())
                .firstName(base.getFirstName())
                .lastName(base.getLastName())
                .avatarUrl(avatarUrl)
                .build();
    }

    public static UserResponse from(User user, String avatarUrl) {
        return UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .role(user.getRole())
                .studentCode(user.getStudentCode())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .avatarUrl(avatarUrl)
                .build();
    }
}
