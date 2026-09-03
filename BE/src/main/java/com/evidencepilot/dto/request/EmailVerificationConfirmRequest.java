package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotBlank;

public record EmailVerificationConfirmRequest(
        @NotBlank(message = "Verification token is required")
        String token
) {
}
