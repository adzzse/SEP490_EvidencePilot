package com.evidencepilot.dto.response;

import java.time.LocalDateTime;

public record EmailOtpRequestResponse(
        String message,
        String email,
        LocalDateTime cooldownUntil
) {
}
