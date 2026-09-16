package com.evidencepilot.dto.response;

import com.evidencepilot.model.FeedbackReply;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

public record FeedbackReplyResponseDto(
        UUID id,
        UUID feedbackId,
        UUID authorId,
        String authorRole,
        String authorName,
        String content,
        LocalDateTime createdAt,
        UUID requestId) {

    public static FeedbackReplyResponseDto from(FeedbackReply reply) {
        return new FeedbackReplyResponseDto(
                reply.getId(),
                reply.getFeedback() != null ? reply.getFeedback().getId() : null,
                reply.getAuthor() != null ? reply.getAuthor().getId() : null,
                reply.getAuthorRole() != null ? reply.getAuthorRole().name() : "UNKNOWN",
                displayName(reply.getAuthor()),
                reply.getContent(),
                reply.getCreatedAt(),
                reply.getRequest() != null ? reply.getRequest().getId() : null);
    }

    private static String displayName(com.evidencepilot.model.User user) {
        if (user == null) return null;
        String name = (Objects.toString(user.getFirstName(), "") + " "
                + Objects.toString(user.getLastName(), "")).trim();
        return name.isEmpty() ? user.getEmail() : name;
    }
}
