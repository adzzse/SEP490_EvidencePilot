package com.evidencepilot.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EmailOtpRequest(
        @NotBlank(message = "Email is required")
        @Email(message = "Invalid email address format")
        @Size(max = 255, message = "Email must not exceed 255 characters")
        String email
) {
}
