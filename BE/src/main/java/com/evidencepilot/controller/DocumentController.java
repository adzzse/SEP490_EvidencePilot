package com.evidencepilot.controller;

import com.evidencepilot.dto.response.DocumentChunkResponse;
import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.DocumentTextResponse;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.Document;
import com.evidencepilot.service.DocumentObjectStorage;
import com.evidencepilot.service.impl.DocumentServiceImpl;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/documents")
@RequiredArgsConstructor
@Tag(name = "Documents", description = "Document metadata, chunks, and text retrieval")
public class DocumentController {

    private final DocumentServiceImpl documentService;
    private final DocumentObjectStorage documentObjectStorage;

    @Operation(summary = "Get document by ID",
            description = "Returns metadata for a single document by UUID.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Document returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Document not found")
    })
    @GetMapping("/{id}")
    public DocumentResponse getDocumentById(
            @Parameter(description = "Document UUID") @PathVariable UUID id) {
        return documentService.getDocumentById(id);
    }

    @Operation(summary = "Upload a document",
            description = "Uploads a document (multipart/form-data) and streams it directly to MinIO. "
                    + "Returns 202 Accepted — processing happens asynchronously via RabbitMQ.")
    @ApiResponses({
            @ApiResponse(responseCode = "202", description = "Document accepted for processing"),
            @ApiResponse(responseCode = "400", description = "Missing or invalid parameters"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public DocumentResponse uploadDocument(
            @Parameter(description = "File to upload") @RequestParam("file") MultipartFile file,
            @Parameter(description = "Project UUID") @RequestParam(value = "projectId", required = false) UUID projectId,
            @Parameter(description = "Collection UUID") @RequestParam(value = "collectionId", required = false) UUID collectionId) {
        // DEBT-08: a document must be attached to a project or collection —
        // orphaned documents are unreachable and skip all project scoping.
        if (projectId == null && collectionId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Either projectId or collectionId must be provided");
        }
        return documentService.uploadDocument(projectId, collectionId, file, DocumentType.SOURCE);
    }

    @Operation(summary = "Attach file to metadata-only document",
            description = "Uploads a PDF file to an existing metadata-only document "
                    + "(status = METADATA_FETCHED). Triggers the extraction pipeline after upload.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "File attached, extraction queued"),
            @ApiResponse(responseCode = "400", description = "Document is not in METADATA_FETCHED status"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Document not found")
    })
    @PostMapping("/{documentId}/file")
    public DocumentResponse attachFileToDocument(
            @Parameter(description = "Document UUID") @PathVariable UUID documentId,
            @Parameter(description = "PDF file to attach") @RequestParam("file") MultipartFile file) {
        return documentService.attachFileToDocument(documentId, file);
    }

    @Operation(summary = "Get document chunks",
            description = "Returns all text chunks for the specified document.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Chunk list returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Document not found")
    })
    @GetMapping("/{id}/chunks")
    public List<DocumentChunkResponse> getDocumentChunks(
            @Parameter(description = "Document UUID") @PathVariable UUID id) {
        return documentService.getDocumentChunks(id);
    }

    @Operation(summary = "Get document extracted text",
            description = "Returns the full extracted text content for the specified document.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Text returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Document or text not found")
    })
    @GetMapping("/{id}/text")
    public DocumentTextResponse getDocumentText(
            @Parameter(description = "Document UUID") @PathVariable UUID id) {
        return documentService.getDocumentText(id);
    }

    @Operation(summary = "Save draft text",
            description = "Saves the extracted text draft for a document. "
                    + "Creates the DocumentText row if it doesn't exist yet.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Draft saved"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Document not found")
    })
    @PutMapping("/{id}/text")
    public DocumentTextResponse saveDraft(
            @Parameter(description = "Document UUID") @PathVariable UUID id,
            @RequestBody String extractedText) {
        return documentService.saveDraft(id, extractedText);
    }

    @Operation(summary = "Download a document PDF",
            description = "Streams the original document file. AI extraction workers use a download token; "
                    + "signed-in users use their JWT access.")
    @GetMapping("/{id}/download")
    public ResponseEntity<InputStreamResource> downloadDocument(
            @PathVariable UUID id,
            @RequestParam(value = "token", required = false) String token) {
        String fileUrl;
        String originalFilename;
        if (token == null) {
            DocumentResponse doc = documentService.getDocumentById(id);
            fileUrl = doc.fileUrl();
            originalFilename = doc.originalFilename();
        } else {
            Document doc = documentService.getDocumentForDownload(id, token);
            fileUrl = doc.getFileUrl();
            originalFilename = doc.getOriginalFilename();
        }
        var stream = documentObjectStorage.getStream(fileUrl);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"" + originalFilename + "\"")
                .body(new InputStreamResource(stream));
    }

    @Operation(summary = "Soft-delete a document",
            description = "Sets the document's active flag to false.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Document soft-deleted"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Document not found")
    })
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDocument(
            @Parameter(description = "Document UUID") @PathVariable UUID id) {
        documentService.deleteDocument(id);
    }

    @Operation(summary = "Re-extract a document",
            description = "Resets the document status and re-publishes the extraction event. "
                    + "The document must have a file already stored in MinIO.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Re-extraction triggered"),
            @ApiResponse(responseCode = "400", description = "No file in storage for this document"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Document not found")
    })
    @PostMapping("/{id}/re-extract")
    public DocumentResponse reExtract(
            @Parameter(description = "Document UUID") @PathVariable UUID id) {
        return documentService.reExtract(id);
    }

    @Operation(summary = "Get document pipeline diagnostics",
            description = "ADMIN only. Returns document metadata, a live OpenAlex metadata re-fetch, "
                    + "and the stored extraction checkpoint from MinIO for debugging the processing pipeline.")
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/{id}/diagnostics")
    public Map<String, Object> getDiagnostics(
            @Parameter(description = "Document UUID") @PathVariable UUID id) {
        return documentService.getDiagnostics(id);
    }
}
