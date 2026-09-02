package com.evidencepilot.dto.response;

import java.util.List;

public record BatchIngestResponse(
    List<DocumentResponse> succeeded,
    List<BatchFailure> failed
) {
    public record BatchFailure(
        String doi,
        String error,
        String code
    ) {}
}