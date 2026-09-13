package com.evidencepilot.dto.response;

import com.evidencepilot.model.enums.PaperStandard;

import java.util.List;

public record CitationValidationResponse(
    boolean valid,
    String paperTitle,
    int totalCitations,
    int matchedCitations,
    List<String> missingCitations,
    List<String> unmatchedKeys,
    List<String> unavailableReferences,
    List<String> formattingIssues,
    PaperStandard standardUsed,
    PaperValidationResponse sectionValidation
) {}
