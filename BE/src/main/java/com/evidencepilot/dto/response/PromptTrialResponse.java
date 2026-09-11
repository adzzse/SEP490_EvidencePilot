package com.evidencepilot.dto.response;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

public record PromptTrialResponse(
        String templateKey,
        String version,
        String promptFingerprint,
        String generationFingerprint,
        String caseId,
        List<String> testedModelIds,
        String provider,
        String model,
        boolean outputValid,
        boolean expectationMatched,
        JsonNode result,
        long durationMs
) {
    public PromptTrialResponse {
        testedModelIds = List.copyOf(testedModelIds);
    }
}
