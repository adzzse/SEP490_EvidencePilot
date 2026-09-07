package com.evidencepilot.dto.request;

import com.evidencepilot.model.enums.FeedbackThreadState;
import jakarta.validation.constraints.NotNull;

public record FeedbackStateRequest(
        @NotNull FeedbackThreadState state,
        @NotNull Long expectedRevision
) {
}
