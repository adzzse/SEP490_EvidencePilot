package com.evidencepilot.dto.response;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record SectionStandardEvaluationResponse(
        UUID id,
        UUID sectionId,
        UUID documentId,
        String status,
        List<String> requirements,
        JsonNode result,
        String errorCode,
        String inputFingerprint,
        String generationFingerprint,
        String generationProvider,
        String generationModel,
        boolean stale,
        LocalDateTime updatedAt
) {
    public SectionStandardEvaluationResponse(UUID id, UUID sectionId, UUID documentId, String status,
            List<String> requirements, JsonNode result, String errorCode, String inputFingerprint,
            boolean stale, LocalDateTime updatedAt) {
        this(id, sectionId, documentId, status, requirements, result, errorCode, inputFingerprint,
                null, null, null, stale, updatedAt);
    }
}
