package com.evidencepilot.dto.response;

import com.fasterxml.jackson.databind.JsonNode;

public record ReviewSubmissionSnapshotResponse(
        String state,
        JsonNode snapshot
) {}
