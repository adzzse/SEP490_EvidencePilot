package com.evidencepilot.dto.response;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record CitationArchiveRoundResponse(
        UUID roundId,
        String origin,
        UUID requestedById,
        LocalDateTime createdAt,
        Integer sectionVersion,
        List<EvidenceTraceResponse> findings) {
}
