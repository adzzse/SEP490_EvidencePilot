package com.evidencepilot.dto.response;

public record PostReplyResult(
        FeedbackReplyResponseDto reply,
        boolean created) {}
