package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record SectionBatchItem(
        @NotNull UUID id,
        Integer sectionOrder,
        String sectionTitle,
        UUID assignedUserId,
        String contentTex,
        Long expectedRevision
) {}
