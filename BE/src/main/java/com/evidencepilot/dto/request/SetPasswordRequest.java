package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SetPasswordRequest(
        @NotBlank(message = "Token is required") String token,
        @NotBlank(message = "New password is required")
        @Size(min = 8, max = 100, message = "Password must be at least 8 characters") String newPassword,
        @Size(max = 100, message = "First name must not exceed 100 characters") String firstName,
        @Size(max = 100, message = "Last name must not exceed 100 characters") String lastName) {
}
