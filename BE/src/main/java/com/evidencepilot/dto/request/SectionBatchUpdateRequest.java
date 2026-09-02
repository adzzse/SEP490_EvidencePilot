package com.evidencepilot.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record SectionBatchUpdateRequest(
        @NotEmpty @Valid List<SectionBatchItem> sections
) {}
