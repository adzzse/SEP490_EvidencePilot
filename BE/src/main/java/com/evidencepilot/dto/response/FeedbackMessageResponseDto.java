package com.evidencepilot.dto.response;

import java.time.LocalDateTime;
import java.util.UUID;

public record FeedbackMessageResponseDto(
        UUID id,
        String kind,
        UUID authorId,
        String authorRole,
        String authorName,
        String content,
        LocalDateTime createdAt,
        LocalDateTime publishedAt,
        UUID publishedRequestId,
        boolean draft
) {
}
