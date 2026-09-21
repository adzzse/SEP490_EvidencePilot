package com.evidencepilot.dto.response;

import java.util.UUID;

public record SectionCitationReviewStateResponse(
        UUID jobId,
        String status,
        int finishedCount,
        int totalCount,
        boolean complete,
        SectionCitationReviewResponse review,
        String errorCode,
        String errorMessage) {
}
