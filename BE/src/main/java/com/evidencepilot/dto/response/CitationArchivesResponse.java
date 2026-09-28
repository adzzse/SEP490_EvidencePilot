package com.evidencepilot.dto.response;

import java.util.List;
import java.util.UUID;

public record CitationArchivesResponse(
        UUID requestId,
        boolean sealed,
        boolean hasSuccessor,
        List<CitationArchiveRoundResponse> student,
        List<CitationArchiveRoundResponse> instructor) {
}
