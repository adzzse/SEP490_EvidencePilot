package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record FeedbackReplyRequest(
        @NotBlank @Size(max = 20_000) String content,
        @NotNull UUID idempotencyKey
) {
}
