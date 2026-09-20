package com.evidencepilot.dto.response;

import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import java.time.LocalDateTime;
import java.util.UUID;

public record FeedbackRequestResponseDto(
    UUID id,
    UUID projectId,
    UUID studentId,
    String studentName,
    UUID instructorId,
    String instructorName,
    FeedbackStatus status,
    LocalDateTime requestedAt,
    LocalDateTime returnedAt,
    LocalDateTime reviewedAt,
    String sectionValidation
) {
    public static FeedbackRequestResponseDto fromEntity(FeedbackRequest request) {
        String studentName = null;
        if (request.getStudent() != null) {
            studentName = (request.getStudent().getFirstName() + " "
                    + request.getStudent().getLastName()).trim();
        }
        String instructorName = null;
        if (request.getInstructor() != null) {
            instructorName = (request.getInstructor().getFirstName() + " "
                    + request.getInstructor().getLastName()).trim();
        }
        return new FeedbackRequestResponseDto(
            request.getId(),
            request.getProject() != null ? request.getProject().getId() : null,
            request.getStudent() != null ? request.getStudent().getId() : null,
            studentName,
            request.getInstructor() != null ? request.getInstructor().getId() : null,
            instructorName,
            request.getStatus(),
            request.getRequestedAt(),
            request.getReturnedAt(),
            request.getReviewedAt(),
            request.getSectionValidation()
        );
    }
}
