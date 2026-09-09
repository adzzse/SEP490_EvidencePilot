package com.evidencepilot.client.openalex;

import com.evidencepilot.dto.openalex.OpenAlexWorkResponse;

import java.io.InputStream;
import java.util.List;

public interface OpenAlexClient {

    OpenAlexWorkResponse fetchWork(String doi);

    /**
     * Best-effort exact-title lookup for works unresolvable by DOI (notably arXiv
     * DataCite DOIs, which OpenAlex stores as locations rather than primary DOIs).
     * Returns the full work, or null when nothing matches exactly.
     */
    OpenAlexWorkResponse findWorkByTitle(String title);

    OpenAlexWorkResponse fetchWorkById(String openAlexId);

    List<OpenAlexWorkResponse> fetchCitedByWorks(String openAlexId, int limit);

    List<OpenAlexWorkResponse> fetchWorksByIds(List<String> openAlexIds, String selectFields);

    InputStream downloadPdf(String oaUrl);

    class OpenAlexApiException extends RuntimeException {
        private final int statusCode;

        public OpenAlexApiException(String message, int statusCode) {
            super(message);
            this.statusCode = statusCode;
        }

        public OpenAlexApiException(String message, Throwable cause) {
            super(message, cause);
            this.statusCode = 0;
        }

        public int getStatusCode() {
            return statusCode;
        }
    }
}
