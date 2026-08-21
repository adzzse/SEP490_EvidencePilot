package com.evidencepilot.dto.request;

import com.evidencepilot.model.enums.StudentAction;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record TraceDecisionRequest(
        @NotNull StudentAction studentAction,
        @NotBlank @Size(max = 2_000) String explanation,
        UUID sourceId,
        UUID chunkId,
        @Size(max = 1_200) String evidenceQuote,
        String relation,
        @NotNull @PositiveOrZero Integer sectionVersion,
        @PositiveOrZero Integer revisedStartOffset,
        @PositiveOrZero Integer revisedEndOffset
) {
}
