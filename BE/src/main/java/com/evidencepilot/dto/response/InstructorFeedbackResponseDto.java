package com.evidencepilot.dto.response;

import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
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
    UUID paperId
) {
    public static InstructorFeedbackResponseDto fromEntity(
            InstructorFeedback feedback, PaperSection section, Integer currentSectionVersion) {
        return fromEntity(feedback, section, currentSectionVersion, null, false);
    }

    public static InstructorFeedbackResponseDto fromEntity(
            InstructorFeedback feedback, PaperSection section, Integer currentSectionVersion,
            FeedbackAnchor anchor, boolean canAnswer) {
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
            feedback.isAnswered(),
            feedback.getAnswerContent(),
            feedback.getAnsweredAt(),
            feedback.getSectionVersion(),
            isStale(feedback.getSectionVersion(), currentSectionVersion),
            feedback.getUpdatedAt(),
            feedback.getUpdatedBy() != null ? feedback.getUpdatedBy().getId() : null,
            feedback.getInstructor() != null ? (java.util.Objects.toString(feedback.getInstructor().getFirstName(), "") + " "
                    + java.util.Objects.toString(feedback.getInstructor().getLastName(), "")).trim() : null,
            anchor,
            canAnswer,
            section != null && section.getDocument() != null ? section.getDocument().getId() : null
        );
    }

    private static boolean isStale(Integer anchorVersion, Integer currentVersion) {
        return anchorVersion != null && currentVersion != null && anchorVersion < currentVersion;
    }
}
