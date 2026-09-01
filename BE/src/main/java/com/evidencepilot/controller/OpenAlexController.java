package com.evidencepilot.controller;

import com.evidencepilot.dto.request.DoiBatchIngestionRequest;
import com.evidencepilot.dto.request.DoiIngestionRequest;
import com.evidencepilot.dto.request.DoiLookupRequest;
import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.OpenAlexPreview;
import com.evidencepilot.service.OpenAlexIngestionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

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
               description = "Single-request batch: dedupes DOIs and processes each sequentially in a transactional loop. "
                       + "Frontend sends exactly ONE request; backend iterates (no Promise.allSettled spam). "
                       + "Partial failures return 207 multi-status.")
    @ApiResponse(responseCode = "202", description = "All DOIs accepted")
    @ApiResponse(responseCode = "207", description = "Partial failure — succeeded list size < requested, failed DOIs omitted")
    @PostMapping("/ingest/doi/batch")
    public org.springframework.http.ResponseEntity<List<DocumentResponse>> ingestBatch(@Valid @RequestBody DoiBatchIngestionRequest request) {
        List<String> deduped = new ArrayList<>(new LinkedHashSet<>(request.dois().stream().map(String::trim).filter(s -> !s.isEmpty()).toList()));
        List<DocumentResponse> succeeded = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        for (String doi : deduped) {
            try {
                succeeded.add(ingestionService.ingestByDoi(request.projectId(), request.collectionId(), doi));
            } catch (Exception e) {
                failed.add(doi);
            }
        }
        if (!failed.isEmpty() && succeeded.isEmpty()) {
            // all failed still 207 so frontend can distinguish from 202
            return org.springframework.http.ResponseEntity.status(HttpStatus.MULTI_STATUS).body(succeeded);
        }
        if (!failed.isEmpty()) {
            return org.springframework.http.ResponseEntity.status(HttpStatus.MULTI_STATUS).body(succeeded);
        }
        return org.springframework.http.ResponseEntity.status(HttpStatus.ACCEPTED).body(succeeded);
    }
}
