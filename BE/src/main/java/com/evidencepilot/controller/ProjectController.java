package com.evidencepilot.controller;

import com.evidencepilot.dto.request.ProjectCreateRequest;
import com.evidencepilot.dto.request.ProjectUpdateRequest;
import com.evidencepilot.dto.response.CollectionResponse;
import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.PagedResponse;
import com.evidencepilot.dto.response.ProjectMemberResponse;
import com.evidencepilot.dto.response.ProjectResponse;
import com.evidencepilot.dto.response.ProjectSourceMapResponse;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.service.DocumentService;
import com.evidencepilot.service.PaperProcessingService;
import com.evidencepilot.service.ProjectService;
import com.evidencepilot.service.impl.ProjectCollectionService;
import com.evidencepilot.service.impl.ProjectSourceMapService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
@Tag(name = "Projects", description = "Project lifecycle and membership management")
public class ProjectController {
    private final ProjectSourceMapService projectSourceMapService;

    private final ProjectService projectService;
    private final DocumentService documentService;
    private final ProjectCollectionService projectCollectionService;
    private final PaperProcessingService paperProcessingService;

    @Operation(summary = "List all projects",
            description = "Returns all active projects accessible to the current user. "
                    + "Admins see all projects; others see only their own.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Project list returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT")
    })
    @GetMapping
    public PagedResponse<ProjectResponse> getAllProjects(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt,desc") String sort,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) ProjectStatus status,
            @RequestParam(required = false) Boolean active) {
        return projectService.getAllProjects(page, size, sort, q, status, active);
    }

    @Operation(summary = "Get project by ID",
            description = "Returns a single project if the current user has access.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Project returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Project not found")
    })
    @GetMapping("/{id}")
    public ProjectResponse getProjectById(
            @Parameter(description = "Project UUID") @PathVariable UUID id) {
        return projectService.getProjectById(id);
    }

    @Operation(summary = "Create a project",
            description = "Creates a new project. Instructors become the project instructor member.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Project created"),
            @ApiResponse(responseCode = "400", description = "Validation error"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProjectResponse createProject(@Valid @RequestBody ProjectCreateRequest request) {
        return projectService.createProject(request);
    }

    @Operation(summary = "Update a project",
            description = "Updates project metadata. Requires write access.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Project updated"),
            @ApiResponse(responseCode = "400", description = "Validation error"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Insufficient permissions"),
            @ApiResponse(responseCode = "404", description = "Project not found")
    })
    @PutMapping("/{id}")
    public ProjectResponse updateProject(
            @Parameter(description = "Project UUID") @PathVariable UUID id,
            @Valid @RequestBody ProjectUpdateRequest request) {
        return projectService.updateProject(id, request);
    }

    @Operation(summary = "Complete a project",
            description = "Marks an ACTIVE project as COMPLETED.")
    @PatchMapping("/{id}/complete")
    public ProjectResponse completeProject(
            @Parameter(description = "Project UUID") @PathVariable UUID id) {
        return projectService.completeProject(id);
    }

    @Operation(summary = "Archive a project",
            description = "Transitions an APPROVED project to ARCHIVED.")
    @PatchMapping("/{id}/archive")
    public ProjectResponse archiveProject(
            @Parameter(description = "Project UUID") @PathVariable UUID id) {
        return projectService.archiveProject(id);
    }

    @Operation(summary = "Unarchive a project",
            description = "Restores an ARCHIVED project to APPROVED.")
    @PatchMapping("/{id}/unarchive")
    public ProjectResponse unarchiveProject(
            @Parameter(description = "Project UUID") @PathVariable UUID id) {
        return projectService.unarchiveProject(id);
    }

    @Operation(summary = "Soft-delete a project",
            description = "Sets the project's active flag to false. Requires write access.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Project soft-deleted"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Insufficient permissions"),
            @ApiResponse(responseCode = "404", description = "Project not found")
    })
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteProject(
            @Parameter(description = "Project UUID") @PathVariable UUID id) {
        projectService.deleteProject(id);
    }

    @Operation(summary = "List project members",
            description = "Returns all members of a project.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Member list returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Project not found")
    })
    @GetMapping("/{id}/members")
    public List<ProjectMemberResponse> getProjectMembers(
            @Parameter(description = "Project UUID") @PathVariable UUID id) {
        return projectService.getProjectMemberResponses(id);
    }

    @Operation(summary = "List project documents",
            description = "Returns paged documents in a project with optional search, filters, and sorting.")
    @GetMapping("/{projectId}/documents")
    public PagedResponse<DocumentResponse> getProjectDocuments(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt,desc") String sort,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) DocumentType docType,
            @RequestParam(required = false) ProcessingStatus processingStatus,
            @RequestParam(required = false) Boolean active) {
        return documentService.getDocumentsByProject(
                projectId, page, size, sort, q, docType, processingStatus, active);
    }

    @Operation(summary = "List project sources",
            description = "Returns paged evidence-source documents in a project.")
    @GetMapping("/{projectId}/sources")
    public PagedResponse<DocumentResponse> getProjectSources(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt,desc") String sort,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) ProcessingStatus processingStatus,
            @RequestParam(required = false) Boolean active) {
        return documentService.getSourcesByProject(
                projectId, page, size, sort, q, processingStatus, active);
    }

    @Operation(summary = "Get project source map",
            description = "Shows project sources and their recorded citation relationships. Reads saved metadata only.")
    @GetMapping("/{projectId}/source-map")
    public ProjectSourceMapResponse getSourceMap(@PathVariable UUID projectId) {
        return projectSourceMapService.getSourceMap(projectId);
    }

    @Operation(summary = "List collections linked to a project")
    @GetMapping("/{projectId}/collections")
    public List<CollectionResponse> getLinkedCollections(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId) {
        return projectCollectionService.getLinkedCollections(projectId);
    }

    @Operation(summary = "Link and synchronize a collection to a project")
    @PutMapping("/{projectId}/collections/{collectionId}")
    public CollectionResponse linkCollection(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId,
            @Parameter(description = "Collection UUID") @PathVariable UUID collectionId) {
        return projectCollectionService.link(projectId, collectionId);
    }

    @Operation(summary = "Stop synchronizing a collection with a project")
    @DeleteMapping("/{projectId}/collections/{collectionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unlinkCollection(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId,
            @Parameter(description = "Collection UUID") @PathVariable UUID collectionId) {
        projectCollectionService.unlink(projectId, collectionId);
    }

    @Operation(summary = "Export project as .tex archive",
            description = "Returns a ZIP of .tex files for all papers in the project.")
    @GetMapping("/{projectId}/export")
    public ResponseEntity<StreamingResponseBody> exportProject(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId,
            @RequestParam(defaultValue = "tex") String format) {
        Path archive = paperProcessingService.exportTexArchive(projectId);
        StreamingResponseBody body = output -> {
            try (InputStream content = Files.newInputStream(archive)) {
                content.transferTo(output);
            } finally {
                Files.deleteIfExists(archive);
            }
        };
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"export.zip\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(body);
    }

    @Operation(summary = "Add a member to a project",
            description = "Adds a student to the project as LEADER or MEMBER. Requires project management access.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Member added"),
            @ApiResponse(responseCode = "400", description = "Invalid user ID or role"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Insufficient permissions"),
            @ApiResponse(responseCode = "409", description = "User is already a project member"),
            @ApiResponse(responseCode = "404", description = "Project or user not found")
    })
    @PostMapping("/{id}/members")
    @ResponseStatus(HttpStatus.CREATED)
    public void addMember(
            @Parameter(description = "Project UUID") @PathVariable UUID id,
            @Parameter(description = "User UUID to add") @RequestParam UUID userId,
            @Parameter(description = "Role to assign") @RequestParam(required = false) ProjectRole role) {
        projectService.addMember(id, userId, role);
    }

    @Operation(summary = "Update a project member role",
            description = "Changes a student project role between LEADER and MEMBER. Requires project management access.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Member role updated"),
            @ApiResponse(responseCode = "400", description = "Invalid project role"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Insufficient permissions"),
            @ApiResponse(responseCode = "404", description = "Project or member not found"),
            @ApiResponse(responseCode = "409", description = "Role change would remove the last leader")
    })
    @PatchMapping("/{id}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateMemberRole(
            @Parameter(description = "Project UUID") @PathVariable UUID id,
            @Parameter(description = "Member user UUID") @PathVariable UUID userId,
            @Parameter(description = "New LEADER or MEMBER role") @RequestParam ProjectRole role) {
        projectService.updateMemberRole(id, userId, role);
    }

    @Operation(summary = "Remove a member from a project",
            description = "Removes a user from the project. Requires project management access.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Member removed"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Insufficient permissions"),
            @ApiResponse(responseCode = "404", description = "Project or member not found")
    })
    @DeleteMapping("/{id}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(
            @Parameter(description = "Project UUID") @PathVariable UUID id,
            @Parameter(description = "User UUID to remove") @PathVariable UUID userId) {
        projectService.removeMember(id, userId);
    }
}
