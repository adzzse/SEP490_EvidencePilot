package com.evidencepilot.dto.request;

import com.evidencepilot.model.enums.FeedbackThreadState;
import com.evidencepilot.model.enums.StudentStatus;
import jakarta.validation.constraints.NotNull;

import jakarta.validation.constraints.Size;

public record FeedbackStateRequest(
        @NotNull FeedbackThreadState state,
        @NotNull Long expectedRevision,
        @Size(max = 4000) String note,
        StudentStatus studentStatus,
        @Size(max = 4000) String studentNote
) {
    public FeedbackStateRequest(FeedbackThreadState state, Long expectedRevision) {
        this(state, expectedRevision, null, null, null);
    }

    public FeedbackStateRequest(FeedbackThreadState state, Long expectedRevision, String note) {
        this(state, expectedRevision, note, null, null);
    }
}
