package com.evidencepilot.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

public record DoiBatchIngestionRequest(
        @NotEmpty(message = "dois must not be empty") List<String> dois,
        UUID projectId,
        UUID collectionId
) {
    @AssertTrue(message = "Either projectId or collectionId must be provided")
    public boolean isValid() {
        return projectId != null || collectionId != null;
    }

    @AssertTrue(message = "Each DOI must be non-blank")
    public boolean areDoisValid() {
        return dois != null && dois.stream().allMatch(d -> d != null && !d.isBlank());
    }
}
