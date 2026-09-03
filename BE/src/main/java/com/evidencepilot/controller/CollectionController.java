package com.evidencepilot.controller;

import com.evidencepilot.dto.request.CollectionRequest;
import com.evidencepilot.dto.response.CitationGraphResponse;
import com.evidencepilot.dto.response.CollectionResponse;
import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.PagedResponse;
import com.evidencepilot.service.CollectionService;
import com.evidencepilot.service.DocumentService;
import com.evidencepilot.service.OpenAlexIngestionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/collections")
@RequiredArgsConstructor
@Tag(name = "Collections", description = "Instructor collection (evidence library) management")
public class CollectionController {

    private final CollectionService collectionService;
    private final DocumentService documentService;
    private final OpenAlexIngestionService openAlexIngestionService;

    @Operation(summary = "Create a collection",
            description = "Creates a new evidence collection owned by the current instructor user.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Collection created"),
            @ApiResponse(responseCode = "400", description = "Validation error"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CollectionResponse createCollection(@Valid @RequestBody CollectionRequest request) {
        return collectionService.createCollection(request);
    }

    @Operation(summary = "List my collections",
            description = "Returns a paginated list of collections owned by the current instructor.")
    @GetMapping
    public PagedResponse<CollectionResponse> getMyCollections(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID categoryId) {
        return collectionService.getMyCollections(page, size, sort, q, categoryId);
    }

    @Operation(summary = "Get collection by ID",
            description = "Returns a single collection by its UUID.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Collection returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Collection not found")
    })
    @GetMapping("/{id}")
    public CollectionResponse getCollectionById(
            @Parameter(description = "Collection UUID") @PathVariable UUID id) {
        return collectionService.getCollectionById(id);
    }

    @Operation(summary = "Update a collection",
            description = "Updates the name, description, or category of a collection.")
    @PutMapping("/{id}")
    public CollectionResponse updateCollection(
            @Parameter(description = "Collection UUID") @PathVariable UUID id,
            @Valid @RequestBody CollectionRequest request) {
        return collectionService.updateCollection(id, request);
    }

    @GetMapping("/{id}/sources")
    public PagedResponse<DocumentResponse> getCollectionSources(
            @Parameter(description = "Collection UUID") @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String q) {
        return documentService.getSourcesByCollection(id, page, size, sort, q);
    }

    @Operation(summary = "List reusable sources",
            description = "Returns active source documents uploaded by the current user that are not already in this collection.")
    @GetMapping("/{id}/library-sources")
    public PagedResponse<DocumentResponse> getAvailableLibrarySources(
            @Parameter(description = "Collection UUID") @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String q) {
        return documentService.getAvailableLibrarySources(id, page, size, sort, q);
    }

    @Operation(summary = "Share collection document to project",
            description = "Shares a source document from a collection to a project by reference. "
                    + "No file copy occurs — chunks and embeddings are reused. "
                    + "Returns suitability score (HIGH/MEDIUM/LOW) based on topic match.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Document shared with suitability info"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Collection, source, or project not found"),
            @ApiResponse(responseCode = "409", description = "Project corpus is locked")
    })
    @PostMapping("/{collectionId}/sources/{sourceId}/share-to-project/{projectId}")
    public Map<String, Object> shareToProject(
            @Parameter(description = "Collection UUID") @PathVariable UUID collectionId,
            @Parameter(description = "Source document UUID") @PathVariable UUID sourceId,
            @Parameter(description = "Target project UUID") @PathVariable UUID projectId) {
        return documentService.shareToProject(collectionId, sourceId, projectId);
    }

    @Operation(summary = "Add existing source to collection",
            description = "Associates an existing source document with this collection.")
    @PostMapping("/{collectionId}/sources/{sourceId}")
    @ResponseStatus(HttpStatus.OK)
    public DocumentResponse addSourceToCollection(
            @Parameter(description = "Collection UUID") @PathVariable UUID collectionId,
            @Parameter(description = "Source document UUID") @PathVariable UUID sourceId) {
        return documentService.addSourceToCollection(collectionId, sourceId);
    }

    @Operation(summary = "Batch add existing sources to collection",
            description = "Associates multiple existing source documents with this collection in one call.")
    @PostMapping("/{collectionId}/sources/batch")
    @ResponseStatus(HttpStatus.OK)
    public List<DocumentResponse> addSourcesToCollectionBatch(
            @Parameter(description = "Collection UUID") @PathVariable UUID collectionId,
            @Valid @RequestBody com.evidencepilot.dto.request.CollectionBatchSourcesRequest request) {
        return documentService.addSourcesToCollectionBatch(collectionId, request.sourceIds());
    }

    @Operation(summary = "Remove a library source from collection",
            description = "Removes only the collection association. The original document and file remain available elsewhere.")
    @DeleteMapping("/{collectionId}/sources/{sourceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeSourceFromCollection(
            @Parameter(description = "Collection UUID") @PathVariable UUID collectionId,
            @Parameter(description = "Source document UUID") @PathVariable UUID sourceId) {
        documentService.removeSourceFromCollection(collectionId, sourceId);
    }

    @Operation(summary = "Soft-delete a collection",
            description = "Sets the collection's active flag to false.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Collection soft-deleted"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Collection not found")
    })
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCollection(
            @Parameter(description = "Collection UUID") @PathVariable UUID id) {
        collectionService.deleteCollection(id);
    }

    @Operation(summary = "Get citation graph",
            description = "Returns nodes and edges representing the citation network among documents in this collection. "
                    + "Nodes include collection documents and their OpenAlex references. "
                    + "Set includeFailed=false to exclude FAILED documents.")
    @GetMapping("/{id}/citation-graph")
    public CitationGraphResponse getCitationGraph(
            @Parameter(description = "Collection UUID") @PathVariable UUID id,
            @RequestParam(defaultValue = "true") boolean includeFailed) {
        return openAlexIngestionService.getCitationGraph(id, includeFailed);
    }


}
