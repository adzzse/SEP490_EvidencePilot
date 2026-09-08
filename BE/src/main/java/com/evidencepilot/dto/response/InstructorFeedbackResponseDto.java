package com.evidencepilot.dto.response;

import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.enums.FeedbackThreadState;

import java.time.LocalDateTime;
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
        Integer sectionVersion,
        boolean stale,
        LocalDateTime updatedAt,
        UUID updatedBy,
        String instructorName,
        FeedbackAnchor anchor,
        UUID paperId,
        LocalDateTime publishedAt,
        FeedbackThreadState threadState,
        FeedbackThreadState pendingState,
        Long revision,
        boolean canMarkDone,
        boolean canReopen,
        boolean canEdit,
        boolean canDelete,
        UUID assignedUserId,
        String assignedUserName
) {
    public static InstructorFeedbackResponseDto fromFeedback(
            InstructorFeedback feedback,
            PaperSection section,
            Integer currentSectionVersion,
            FeedbackAnchor anchor,
            boolean canMarkDone,
            boolean canReopen,
            boolean canEdit,
            boolean canDelete,
            FeedbackThreadState pendingState) {
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
                feedback.getSectionVersion(),
                isStale(feedback.getSectionVersion(), currentSectionVersion),
                feedback.getUpdatedAt(),
                feedback.getUpdatedBy() != null ? feedback.getUpdatedBy().getId() : null,
                displayName(feedback.getInstructor()),
                anchor,
                section != null && section.getDocument() != null ? section.getDocument().getId() : null,
                feedback.getPublishedAt(),
                feedback.getThreadState() == null ? FeedbackThreadState.OPEN : feedback.getThreadState(),
                pendingState,
                feedback.getOptVersion(),
                canMarkDone,
                canReopen,
                canEdit,
                canDelete,
                section != null && section.getAssignedUser() != null ? section.getAssignedUser().getId() : null,
                section != null ? displayName(section.getAssignedUser()) : null);
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
