package com.evidencepilot.dto.response;

import com.evidencepilot.model.DocumentText;

import java.util.UUID;

public record DocumentTextResponse(
    UUID id,
    UUID documentId,
    String extractedText,
    String extractionMethod
) {
    public static DocumentTextResponse from(DocumentText text) {
        return new DocumentTextResponse(
                text.getId(),
                text.getDocument() != null ? text.getDocument().getId() : null,
                text.getExtractedText(),
                text.getExtractionMethod());
    }
}
