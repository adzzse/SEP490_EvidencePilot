package com.evidencepilot.dto.response;

import java.util.List;
import java.util.UUID;

public record PaperReferenceCheckResponse(
        boolean referenceSectionFound,
        Summary summary,
        List<Item> items) {

    public PaperReferenceCheckResponse {
        items = items == null ? List.of() : List.copyOf(items);
    }

    public enum Status {
        READY,
        MISSING_FILE,
        PROCESSING,
        UNAVAILABLE,
        MISSING_SOURCE,
        NEEDS_REVIEW
    }

    public enum MatchReason {
        CITATION_KEY,
        DOI,
        TITLE_YEAR,
        NONE,
        AMBIGUOUS
    }

    public record Summary(
            int detected,
            int ready,
            int missingFile,
            int processing,
            int unavailable,
            int missingSource,
            int needsReview,
            int matchedNotDeclared) {
    }

    public record Item(
            int index,
            String rawText,
            String doi,
            Integer publicationYear,
            Status status,
            MatchReason matchReason,
            UUID matchedSourceId,
            String matchedSourceTitle,
            boolean declaredReference) {
    }
}
