package com.evidencepilot.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record SectionBatchItem(
        @NotNull UUID id,
        @NotNull @Min(0) Integer sectionOrder,
        @NotBlank @Size(max = 255) String sectionTitle,
        UUID assignedUserId,
        String contentTex,
        @NotNull @Min(0) Long expectedRevision
) {}
