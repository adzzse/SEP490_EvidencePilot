package com.evidencepilot.dto.response;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record SectionCitationReviewResponse(
        String reviewVersion,
        String ruleCatalogVersion,
        UUID sectionId,
        Integer sectionVersion,
        @JsonAlias("contentFingerprint") String reviewInputFingerprint,
        String sectionContentFingerprint,
        LocalDateTime reviewedAt,
        String provider,
        String model,
        String generationFingerprint,
        List<String> modelsUsed,
        boolean complete,
        String summary,
        List<Finding> findings,
        List<String> limitations
) {
    public SectionCitationReviewResponse {
        modelsUsed = modelsUsed == null
                ? model == null || model.isBlank() ? List.of() : List.of(model)
                : List.copyOf(modelsUsed);
        findings = findings == null ? List.of() : List.copyOf(findings);
        limitations = limitations == null ? List.of() : List.copyOf(limitations);
    }

    public SectionCitationReviewResponse(String reviewVersion, String ruleCatalogVersion, UUID sectionId,
            Integer sectionVersion, String reviewInputFingerprint, String sectionContentFingerprint,
            LocalDateTime reviewedAt, String provider, String model, boolean complete, String summary,
            List<Finding> findings, List<String> limitations) {
        this(reviewVersion, ruleCatalogVersion, sectionId, sectionVersion, reviewInputFingerprint,
                sectionContentFingerprint, reviewedAt, provider, model, null, null, complete, summary,
                findings, limitations);
    }

    public enum FindingType {
        UNSUBSTANTIATED_CLAIM,
        SOURCE_DISCREPANCY
    }

    public enum Confidence {
        HIGH,
        MEDIUM,
        LOW
    }

    public enum EvidenceRelation {
        SUPPORTS,
        CONTRADICTS,
        NOT_FOUND
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Finding(
            FindingType type,
            String excerpt,
            int startOffset,
            int endOffset,
            String rationale,
            Confidence confidence,
            List<Evidence> evidence
    ) {
        public Finding {
            evidence = evidence == null ? List.of() : List.copyOf(evidence);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Evidence(
            UUID sourceId,
            UUID chunkId,
            String quote,
            EvidenceRelation relation
    ) {
    }
}
