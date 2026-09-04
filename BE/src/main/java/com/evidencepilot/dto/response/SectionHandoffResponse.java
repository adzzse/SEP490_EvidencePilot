package com.evidencepilot.dto.response;

import java.time.LocalDateTime;
import java.util.UUID;

public record SectionHandoffResponse(
        UUID sectionId,
        String state,
        String currentInputFingerprint,
        UUID confirmedById,
        String confirmedByName,
        LocalDateTime confirmedAt,
        Integer confirmedContentVersion,
        Long revision
) {}
