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
        boolean stale,
        LocalDateTime updatedAt
) {}
