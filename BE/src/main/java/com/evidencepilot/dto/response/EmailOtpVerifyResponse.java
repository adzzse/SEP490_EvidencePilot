package com.evidencepilot.dto.response;

import java.time.LocalDateTime;

public record EmailOtpVerifyResponse(
        String message,
        String email,
        String claimToken,
        LocalDateTime claimExpiresAt
) {
}
