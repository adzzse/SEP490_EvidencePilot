package com.evidencepilot.dto.response;

import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.enums.FeedbackThreadState;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

public record InstructorFeedbackResponseDto(
        UUID id,
        UUID requestId,
        UUID sectionId,
        String sectionTitle,
        Integer sectionOrder,
        UUID instructorId,
        String lineReference,
        String content,
        LocalDateTime createdAt,
        boolean answered,
        String answerContent,
        LocalDateTime answeredAt,
        Integer sectionVersion,
        boolean stale,
        LocalDateTime updatedAt,
        UUID updatedBy,
        String instructorName,
        FeedbackAnchor anchor,
        boolean canAnswer,
        UUID paperId,
        LocalDateTime publishedAt,
        FeedbackThreadState threadState,
        FeedbackThreadState pendingState,
        Long revision,
        String replyState,
        boolean canDraftReply,
        boolean canMarkDone,
        boolean canReopen,
        boolean canEdit,
        boolean canDelete,
        List<FeedbackMessageResponseDto> messages
) {
    public static InstructorFeedbackResponseDto fromConversation(
            InstructorFeedback feedback,
            PaperSection section,
            Integer currentSectionVersion,
            FeedbackAnchor anchor,
            boolean canAnswer,
            boolean canDraftReply,
            boolean canMarkDone,
            boolean canReopen,
            boolean canEdit,
            boolean canDelete,
            FeedbackThreadState pendingState,
            List<FeedbackMessageResponseDto> messages) {
        List<FeedbackMessageResponseDto> conversation = List.copyOf(messages);
        FeedbackMessageResponseDto lastPublished = conversation.stream()
                .filter(message -> !message.draft())
                .max(Comparator.comparing(
                        FeedbackMessageResponseDto::publishedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .orElse(null);
        String replyState = lastPublished == null ? "UNKNOWN"
                : "STUDENT".equals(lastPublished.authorRole()) ? "ANSWERED"
                : "UNKNOWN".equals(lastPublished.authorRole()) ? "UNKNOWN" : "UNANSWERED";
        return new InstructorFeedbackResponseDto(
                feedback.getId(),
                feedback.getRequest() != null ? feedback.getRequest().getId() : null,
                feedback.getSection() != null ? feedback.getSection().getId() : null,
                section != null ? section.getSectionTitle() : null,
                section != null ? section.getSectionOrder() : null,
                feedback.getInstructor() != null ? feedback.getInstructor().getId() : null,
                feedback.getLineReference(),
                feedback.getContent(),
                feedback.getCreatedAt(),
                "ANSWERED".equals(replyState),
                "ANSWERED".equals(replyState) && lastPublished != null ? lastPublished.content() : null,
                "ANSWERED".equals(replyState) && lastPublished != null ? lastPublished.publishedAt() : null,
                feedback.getSectionVersion(),
                isStale(feedback.getSectionVersion(), currentSectionVersion),
                feedback.getUpdatedAt(),
                feedback.getUpdatedBy() != null ? feedback.getUpdatedBy().getId() : null,
                displayName(feedback.getInstructor()),
                anchor,
                canAnswer,
                section != null && section.getDocument() != null ? section.getDocument().getId() : null,
                feedback.getPublishedAt(),
                feedback.getThreadState() == null ? FeedbackThreadState.OPEN : feedback.getThreadState(),
                pendingState,
                feedback.getOptVersion(),
                replyState,
                canDraftReply,
                canMarkDone,
                canReopen,
                canEdit,
                canDelete,
                conversation);
    }

    private static boolean isStale(Integer anchorVersion, Integer currentVersion) {
        return anchorVersion != null && currentVersion != null && anchorVersion < currentVersion;
    }

    private static String displayName(com.evidencepilot.model.User user) {
        if (user == null) return null;
        String name = (java.util.Objects.toString(user.getFirstName(), "") + " "
                + java.util.Objects.toString(user.getLastName(), "")).trim();
        return name.isEmpty() ? user.getEmail() : name;
    }
}
