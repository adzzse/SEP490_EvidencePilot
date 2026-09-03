package com.evidencepilot.dto.response;

import java.time.LocalDateTime;

public record EmailChangeResponse(
        String message,
        String pendingEmail,
        LocalDateTime expiresAt
) {
}
