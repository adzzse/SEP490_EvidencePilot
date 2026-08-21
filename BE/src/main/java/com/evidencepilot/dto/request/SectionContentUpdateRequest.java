package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record SectionContentUpdateRequest(
    @Size(max = 5_000_000) String content,
    @NotNull @PositiveOrZero Long expectedRevision
) {}
