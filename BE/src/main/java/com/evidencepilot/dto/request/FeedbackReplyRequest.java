package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record FeedbackReplyRequest(
        @NotNull UUID requestId,
        @NotBlank @Size(max = 4000) String content,
        UUID idempotencyKey,
        List<UUID> mediaAssetIds) {

    public FeedbackReplyRequest(UUID requestId, String content, UUID idempotencyKey) {
        this(requestId, content, idempotencyKey, null);
    }
}
