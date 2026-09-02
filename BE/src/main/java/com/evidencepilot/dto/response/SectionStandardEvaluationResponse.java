package com.evidencepilot.dto.response;

import com.evidencepilot.model.SectionStandardEvaluation;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record SectionStandardEvaluationResponse(
        UUID id,
        UUID sectionId,
        UUID documentId,
        String status,
        Integer passThreshold,
        List<String> requirements,
        Integer scorePercent,
        String resultJson,
        String errorMessage,
        String inputFingerprint,
        LocalDateTime updatedAt
) {
    public static SectionStandardEvaluationResponse from(SectionStandardEvaluation e) {
        return new SectionStandardEvaluationResponse(
                e.getId(), e.getSectionId(), e.getDocumentId(),
                e.getStatus(), e.getPassThreshold(), e.getRequirements(),
                e.getScorePercent(), e.getResultJson(), e.getErrorMessage(),
                e.getInputFingerprint(), e.getUpdatedAt());
    }
}
