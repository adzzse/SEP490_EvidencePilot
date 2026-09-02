package com.evidencepilot.controller;

import com.evidencepilot.client.openalex.DoiUtils;
import com.evidencepilot.dto.request.DoiBatchIngestionRequest;
import com.evidencepilot.dto.request.DoiIngestionRequest;
import com.evidencepilot.dto.request.DoiLookupRequest;
import com.evidencepilot.dto.response.BatchIngestResponse;
import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.OpenAlexPreview;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.service.OpenAlexIngestionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/documents")
@RequiredArgsConstructor
@Tag(name = "OpenAlex DOI Ingestion",
     description = "Lookup and ingest documents via DOI through the OpenAlex API")
public class OpenAlexController {

    private final OpenAlexIngestionService ingestionService;

    @Operation(summary = "Lookup a DOI",
               description = "Fetches metadata from OpenAlex for the given DOI. "
                       + "Returns a preview without persisting anything.")
    @ApiResponse(responseCode = "200", description = "DOI metadata returned")
    @ApiResponse(responseCode = "400", description = "Invalid DOI")
    @PostMapping("/lookup")
    public OpenAlexPreview lookupByDoi(@Valid @RequestBody DoiLookupRequest request) {
        return ingestionService.lookupByDoi(request.doi());
    }

    @Operation(summary = "Ingest by DOI",
               description = "Fetches metadata from OpenAlex, downloads the OA PDF, "
                       + "saves it to MinIO, and triggers the extraction pipeline. "
                       + "Returns 202 Accepted — processing happens asynchronously via RabbitMQ.")
    @ApiResponse(responseCode = "202", description = "Document accepted for processing")
    @ApiResponse(responseCode = "400", description = "DOI not found, no OA PDF available, or missing project/collection")
    @ApiResponse(responseCode = "404", description = "Project or collection not found")
    @PostMapping("/ingest/doi")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public DocumentResponse ingestByDoi(@Valid @RequestBody DoiIngestionRequest request) {
        return ingestionService.ingestByDoi(
                request.projectId(), request.collectionId(), request.doi());
    }

    @Operation(summary = "Batch ingest by DOIs",
               description = "Single-request batch: dedupes DOIs and processes each sequentially. "
                       + "Frontend sends exactly ONE request; backend iterates (no Promise.allSettled spam). "
                       + "Partial failures return 207 multi-status.")
    @ApiResponse(responseCode = "202", description = "All DOIs accepted")
    @ApiResponse(responseCode = "207", description = "Partial failure with succeeded documents and structured failed DOI entries")
    @PostMapping("/ingest/doi/batch")
    public ResponseEntity<BatchIngestResponse> ingestBatch(@Valid @RequestBody DoiBatchIngestionRequest request) {
        List<DocumentResponse> succeeded = new ArrayList<>();
        List<BatchIngestResponse.BatchFailure> failed = new ArrayList<>();
        Map<String, String> deduped = new LinkedHashMap<>();
        for (String rawDoi : request.dois()) {
            String doi = DoiUtils.normalize(rawDoi);
            if (!DoiUtils.isValid(doi)) {
                failed.add(new BatchIngestResponse.BatchFailure(rawDoi, "Invalid DOI", "FORMAT"));
            } else {
                deduped.putIfAbsent(doi.toLowerCase(Locale.ROOT), doi);
            }
        }
        for (String doi : deduped.values()) {
            try {
                succeeded.add(ingestionService.ingestByDoi(request.projectId(), request.collectionId(), doi));
            } catch (ResourceNotFoundException e) {
                throw e;
            } catch (ResponseStatusException e) {
                if (e.getStatusCode().value() == 401
                        || e.getStatusCode().value() == 403
                        || e.getStatusCode().value() == 409) {
                    throw e;
                }
                failed.add(new BatchIngestResponse.BatchFailure(doi, e.getReason(), resolveCode(e)));
            } catch (Exception e) {
                failed.add(new BatchIngestResponse.BatchFailure(doi, e.getMessage(), resolveCode(e)));
            }
        }
        if (!failed.isEmpty()) {
            return ResponseEntity.status(HttpStatus.MULTI_STATUS).body(new BatchIngestResponse(succeeded, failed));
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(new BatchIngestResponse(succeeded, List.of()));
    }

    private String resolveCode(Exception e) {
        String message = (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName())
                .toLowerCase(Locale.ROOT);
        if (message.contains("format") || message.contains("invalid doi")) return "FORMAT";
        if (message.contains("not found") || message.contains("404")) return "NOT_FOUND";
        if (message.contains("no pdf") || message.contains("pdf")) return "NO_PDF";
        if (message.contains("rate limit") || message.contains("429")) return "RATE_LIMIT";
        if (message.contains("network") || message.contains("timeout") || message.contains("connect")) return "NETWORK";
        return "UNKNOWN";
    }
}
