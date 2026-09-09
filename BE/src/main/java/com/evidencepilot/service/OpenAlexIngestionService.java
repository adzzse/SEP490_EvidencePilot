package com.evidencepilot.service;

import com.evidencepilot.dto.openalex.OpenAlexWorkResponse;
import com.evidencepilot.dto.response.CitationGraphResponse;
import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.OpenAlexPreview;
import com.evidencepilot.model.Document;
import java.util.UUID;

public interface OpenAlexIngestionService {

    OpenAlexPreview lookupByDoi(String doi);

    DocumentResponse ingestByDoi(UUID projectId, UUID collectionId, String doi);

    void persistReferences(UUID documentId);

    void persistCitedBy(UUID documentId);

    /**
     * Best-effort persistence of REFERENCES + CITED_BY edges for an already-fetched
     * work. Never throws — failures are logged. No-op when the work carries no
     * graph data (e.g. sheet-metadata fallback with no OpenAlex id/references).
     */
    void persistCitationGraph(Document document, OpenAlexWorkResponse work);

    CitationGraphResponse getCitationGraph(UUID collectionId, boolean includeFailed);
}
