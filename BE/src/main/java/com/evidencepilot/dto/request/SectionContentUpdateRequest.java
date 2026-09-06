package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import java.util.List;

public record SectionContentUpdateRequest(
    @Size(max = 5_000_000) String content,
    @NotNull @PositiveOrZero Long expectedRevision,
    @Size(max = 10000) List<@Valid TextChange> changes
) {
    public SectionContentUpdateRequest(String content, Long expectedRevision) {
        this(content, expectedRevision, null);
    }

    // Offsets address the previous saved source, normalized to LF, in UTF-16 units.
    public record TextChange(@NotNull @PositiveOrZero Integer from,
                             @NotNull @PositiveOrZero Integer to,
                             @NotNull @Size(max = 5_000_000) String insert) {}
}
