package com.evidencepilot.dto.response;

/**
 * Canonical revision-comparison source for one section in one active review.
 * {@code baseline} is the latest earlier RETURNED baseline, else the initial
 * assignment baseline, else null (honest unavailable — never invented).
 */
public record ComparisonSourceDto(
        Submitted submitted,
        Baseline baseline
) {
    public record Submitted(
            String contentTex,
            Integer contentVersion
    ) {
    }

    public record Baseline(
            String contentTex,
            Integer contentVersion,
            String origin
    ) {
        public static final String INITIAL_ASSIGNMENT = "INITIAL_ASSIGNMENT";
        public static final String RETURN_FOR_REVISION = "RETURN_FOR_REVISION";
    }
}
