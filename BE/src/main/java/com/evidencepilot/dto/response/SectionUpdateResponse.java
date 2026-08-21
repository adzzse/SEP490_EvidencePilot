package com.evidencepilot.dto.response;

import java.time.LocalDateTime;
import java.util.UUID;

public record SectionUpdateResponse(
        UUID id,
        Integer version,
        Long revision,
        LocalDateTime updatedAt) {

    public static SectionUpdateResponse from(PaperSectionResponse section) {
        return new SectionUpdateResponse(
                section.id(), section.version(), section.revision(), section.updatedAt());
    }
}
