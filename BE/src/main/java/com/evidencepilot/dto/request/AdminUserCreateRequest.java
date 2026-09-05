package com.evidencepilot.dto.request;

import com.evidencepilot.model.enums.UserRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AdminUserCreateRequest(
        @NotBlank @Size(max = 255) String email,
        @NotBlank @Size(max = 100) String firstName,
        @NotBlank @Size(max = 100) String lastName,
        @NotNull UserRole role,
        @Size(max = 50) String studentCode,
        boolean devBypass) {
}
