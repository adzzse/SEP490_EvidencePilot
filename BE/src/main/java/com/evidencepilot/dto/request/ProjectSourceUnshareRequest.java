package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record ProjectSourceUnshareRequest(
        @NotEmpty(message = "sourceIds list cannot be empty")
        @Size(max = 100, message = "sourceIds cannot contain more than 100 sources")
        List<UUID> sourceIds) {
}
