package com.evidencepilot.dto.response;

import java.util.List;
import java.util.UUID;

/**
 * Extractor-owned frontmatter for the View Full Paper display: title, authors
 * and keywords from the extraction bundle, plus bibliographic fields
 * (DOI, publisher, year) that live on the document itself.
 */
public record PaperMetadataResponse(
        UUID documentId,
        String title,
        List<AuthorEntry> authors,
        String keywords,
        String doi,
        String publisher,
        Integer publicationYear) {
    public record AuthorEntry(String name, List<String> affiliations, List<String> emails) {
    }
}
