package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

public record CollectionBatchSourcesRequest(
        @NotEmpty(message = "sourceIds list cannot be empty")
        List<UUID> sourceIds
) {
}
