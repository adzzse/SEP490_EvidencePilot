package com.evidencepilot.controller;

import com.evidencepilot.dto.response.CitationValidationResponse;
import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.FormatScanResponse;
import com.evidencepilot.dto.response.PaperSectionResponse;
import com.evidencepilot.dto.response.PaperStandardSuggestionResponse;
import com.evidencepilot.dto.response.PaperValidationResponse;
import com.evidencepilot.dto.response.JobSubmitResponse;
import com.evidencepilot.dto.response.SectionUpdateResponse;
import com.evidencepilot.dto.request.SectionContentUpdateRequest;
import com.evidencepilot.dto.request.SectionReviewSourceMatchRequest;
import com.evidencepilot.dto.request.SectionSuggestionRequest;
import com.evidencepilot.dto.response.SectionCitationReviewResponse;

import com.evidencepilot.dto.response.EvidenceTraceResponse;
import com.evidencepilot.dto.request.TraceDecisionRequest;
import com.evidencepilot.dto.request.TraceReviewRequest;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.TraceOutcome;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CitationValidationService;
import com.evidencepilot.service.CheckpointService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.DocumentService;
import com.evidencepilot.service.FormatScanService;
import com.evidencepilot.service.AiEvaluationService;
import com.evidencepilot.service.PaperProcessingService;
import com.evidencepilot.service.impl.EvidenceTraceService;
import com.evidencepilot.service.impl.SectionCitationReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Papers", description = "Student paper submissions, sections, and Citation Review")
public class PaperController {

    private final DocumentService documentService;
    private final PaperProcessingService paperProcessingService;
    private final CitationValidationService citationValidationService;
    private final FormatScanService formatScanService;
    private final ProjectRepository projectRepository;
    private final DocumentRepository documentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final FeedbackRequestRepository feedbackRequestRepository;
    private final CurrentUserService currentUserService;
    private final CheckpointService checkpointService;
    private final AiEvaluationService aiEvaluationService;
    private final SectionCitationReviewService sectionCitationReviewService;
    private final EvidenceTraceService evidenceTraceService;

    @Operation(summary = "List all papers",
            description = "Returns all active paper documents. "
                    + "Admins see all; students see only their own papers.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Paper list returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT")
    })
    @GetMapping("/papers")
    public List<DocumentResponse> findAll() {
        return documentService.getAllPapersForCurrentUser();
    }

    @Operation(summary = "Get paper by ID",
            description = "Returns a single paper document by UUID.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Paper returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Paper not found")
    })
    @GetMapping("/papers/{id}")
    public DocumentResponse findById(
            @Parameter(description = "Paper document UUID") @PathVariable UUID id) {
        DocumentResponse doc = documentService.getDocumentById(id);
        if (doc.docType() != DocumentType.PAPER || !doc.active()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Paper not found: " + id);
        }
        return doc;
    }

    @Operation(summary = "List papers by project",
            description = "Returns all active paper documents belonging to a project.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Paper list returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Project not found")
    })
    @GetMapping("/projects/{projectId}/papers")
    public List<DocumentResponse> findByProject(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId) {
        return documentService.getDocumentsByProject(projectId).stream()
                .filter(d -> d.docType() == DocumentType.PAPER && d.active())
                .toList();
    }

    @Operation(summary = "Get paper sections",
            description = "Returns all sections of a paper document in order.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Section list returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Paper not found")
    })
    @GetMapping("/papers/{id}/sections")
    public List<PaperSectionResponse> sections(
            @Parameter(description = "Paper document UUID") @PathVariable UUID id,
            @Parameter(description = "Filter by assigned user") @RequestParam(required = false) UUID assignedUserId) {
        if (assignedUserId != null) {
            return paperProcessingService.getPaperSectionsByUser(id, assignedUserId);
        }
        return paperProcessingService.getPaperSections(id);
    }

    @Operation(summary = "Get the previous saved section content",
            description = "Returns the current section and its single previousContentTex undo slot.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Current and previous save returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Section not found")
    })
    @GetMapping("/papers/{documentId}/sections/{sectionId}/history")
    public PaperSectionResponse sectionHistory(
            @Parameter(description = "Paper document UUID") @PathVariable UUID documentId,
            @Parameter(description = "Section UUID") @PathVariable UUID sectionId) {
        return paperProcessingService.getSectionHistory(documentId, sectionId);
    }

    @Operation(summary = "Validate paper against standard",
            description = "Compares detected paper sections against the project's targetStandard. "
                    + "Returns missing, extra, and out-of-order sections.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Validation result returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Paper not found")
    })
    @GetMapping("/papers/{id}/validate")
    public PaperValidationResponse validate(
            @Parameter(description = "Paper document UUID") @PathVariable UUID id) {
        return paperProcessingService.validateSections(id);
    }

    @Operation(summary = "Suggest the uploaded paper's format standard",
            description = "Uses deterministic markers from the filename and extracted text. "
                    + "The result is advisory and does not change the project or paper sections.")
    @GetMapping("/papers/{id}/standard-suggestion")
    public PaperStandardSuggestionResponse suggestStandard(
            @Parameter(description = "Paper document UUID") @PathVariable UUID id) {
        return paperProcessingService.suggestStandard(id);
    }

    @Operation(summary = "Deep citation scan",
            description = "Parses \\cite{} and \\bibitem{} from all sections, checks key existence "
                    + "against project sources, and validates citation format against PaperStandard.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Citation validation result"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Paper not found")
    })
    @GetMapping("/papers/{id}/validate-citations")
    public CitationValidationResponse validateCitations(
            @Parameter(description = "Paper document UUID") @PathVariable UUID id) {
        return citationValidationService.validateCitations(id);
    }

    @Operation(summary = "Smart format scan",
            description = "Scans paper for structure, tone, citation, and quotation issues. "
                    + "Replaces the old citation-only scan with a comprehensive format check.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Format scan result"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Paper not found")
    })
    @GetMapping("/papers/{id}/format-scan")
    public FormatScanResponse formatScan(
            @Parameter(description = "Paper document UUID") @PathVariable UUID id) {
        return formatScanService.scanFormat(id);
    }

    @Operation(summary = "Update a paper section",
            description = "Assigned students may update content. Instructors may rename, reorder, "
                    + "or merge sections only while every section is unassigned. "
                    + "Structure and content changes must be sent separately.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Section updated"),
            @ApiResponse(responseCode = "400", description = "Invalid or oversized section content"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Section not found"),
            @ApiResponse(responseCode = "409", description = "Section revision conflict")
    })
    @PutMapping("/papers/{documentId}/sections/{sectionId}")
    public SectionUpdateResponse updateSection(
            @Parameter(description = "Paper document UUID") @PathVariable UUID documentId,
            @Parameter(description = "Section UUID") @PathVariable UUID sectionId,
            @Parameter(description = "Section content (send structure changes as query params)") @Valid @RequestBody(required = false) SectionContentUpdateRequest body,
            @RequestParam(required = false) String title,
            @RequestParam(required = false) Integer order,
            @RequestParam(required = false) UUID mergeIntoId) {
        String content = body != null ? body.content() : null;
        Long expectedRevision = body != null ? body.expectedRevision() : null;
        PaperSectionResponse updated = paperProcessingService.updateSection(
                documentId, sectionId, title, order, mergeIntoId, content, expectedRevision);
        return SectionUpdateResponse.from(updated);
    }

    @Operation(summary = "Assign a student to a paper section",
            description = "Sets the assigned user for a section. Only instructors and admins can call this.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Section assignment updated"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Section or user not found")
    })
    @PutMapping("/papers/{documentId}/sections/{sectionId}/assign")
    public PaperSectionResponse assignSection(
            @Parameter(description = "Paper document UUID") @PathVariable UUID documentId,
            @Parameter(description = "Section UUID") @PathVariable UUID sectionId,
            @Parameter(description = "User UUID to assign, or null to unassign") @RequestParam(required = false) UUID assignedUserId) {
        return paperProcessingService.assignSection(documentId, sectionId, assignedUserId);
    }

    @Operation(summary = "Restore the previous saved section content",
            description = "Restores the immediately previous save as a new revision. "
                    + "Only the assigned student can restore it.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Section rolled back"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Section not found"),
            @ApiResponse(responseCode = "409", description = "No previous save or section revision conflict")
    })
    @PostMapping("/papers/{documentId}/sections/{sectionId}/rollback")
    public PaperSectionResponse rollbackSection(
            @Parameter(description = "Paper document UUID") @PathVariable UUID documentId,
            @Parameter(description = "Section UUID") @PathVariable UUID sectionId,
            @Parameter(description = "Current optimistic-lock revision")
            @RequestParam Long expectedRevision) {
        return paperProcessingService.rollbackSection(documentId, sectionId, expectedRevision);
    }

    @Operation(summary = "Soft-delete a paper section",
            description = "Instructors may delete an unassigned setup section only when it has "
                    + "no student content or feedback.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Section soft-deleted"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Section not found")
    })
    @DeleteMapping("/papers/{documentId}/sections/{sectionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSection(
            @Parameter(description = "Paper document UUID") @PathVariable UUID documentId,
            @Parameter(description = "Section UUID") @PathVariable UUID sectionId) {
        paperProcessingService.deleteSection(documentId, sectionId);
    }

    @Operation(summary = "Create a new paper section",
            description = "Allows an instructor to add a section while every section is unassigned. "
                    + "Optionally specify a parent section ID for validation. "
                    + "If standard is provided, creates all required sections for that standard.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Section(s) created"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Paper not found")
    })
    @PostMapping("/papers/{documentId}/sections/create")
    @ResponseStatus(HttpStatus.CREATED)
    public PaperSectionResponse createSection(
            @Parameter(description = "Paper document UUID") @PathVariable UUID documentId,
            @RequestParam String title,
            @RequestParam(required = false) UUID parentSectionId,
            @RequestParam(required = false) String standard) {
        if (standard != null) {
            List<PaperSectionResponse> created = paperProcessingService.createSectionsFromStandard(documentId, standard);
            return created.isEmpty() ? null : created.get(0);
        }
        return paperProcessingService.createSection(documentId, title, parentSectionId);
    }

    @Operation(summary = "Generate AI citation review for a section",
            description = "Queues Citation Review for one saved section and returns a jobId. "
                    + "Poll GET /api/jobs/{jobId} for the result.")
    @ApiResponses({
            @ApiResponse(responseCode = "202", description = "Review queued"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Paper not found")
    })
    @PostMapping("/papers/{documentId}/sections/{sectionId}/review")
    public ResponseEntity<JobSubmitResponse> reviewSection(
            @Parameter(description = "Paper document UUID") @PathVariable UUID documentId,
            @Parameter(description = "Section UUID") @PathVariable UUID sectionId) {
        User currentUser = currentUserService.requireCurrentUser();
        PaperSection section = requireReviewSection(documentId, sectionId);
        currentUserService.requireSectionContentWriteAccess(currentUser, section);
        String reviewInputFingerprint =
                sectionCitationReviewService.reviewInputFingerprint(section);
        return ResponseEntity.accepted().body(aiEvaluationService.submitSectionCitationReview(
                section.getDocument().getProject().getId(),
                documentId,
                sectionId,
                reviewInputFingerprint,
                currentUser.getId()));
    }

    @Operation(summary = "Get the current cached section citation review")
    @GetMapping("/papers/{documentId}/sections/{sectionId}/review")
    public ResponseEntity<SectionCitationReviewResponse> getSectionReview(
            @PathVariable UUID documentId,
            @PathVariable UUID sectionId) {
        User currentUser = currentUserService.requireCurrentUser();
        PaperSection section = requireReviewSection(documentId, sectionId);
        currentUserService.requireProjectAccess(currentUser, section.getDocument().getProject());
        return sectionCitationReviewService.cached(documentId, sectionId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @Operation(summary = "Find related project sources for section review findings (async)")
    @PostMapping("/papers/{documentId}/sections/{sectionId}/review/source-matches")
    public JobSubmitResponse findReviewSources(
            @PathVariable UUID documentId,
            @PathVariable UUID sectionId,
            @Valid @RequestBody SectionReviewSourceMatchRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        PaperSection section = requireReviewSection(documentId, sectionId);
        currentUserService.requireProjectAccess(currentUser, section.getDocument().getProject());
        return aiEvaluationService.submitSourceMatches(
                section.getDocument().getProject().getId(), documentId, sectionId, request.findings());
    }

    @Operation(summary = "Record the student's decision on a review finding (evidence revision trace)")
    @PatchMapping("/papers/{documentId}/sections/{sectionId}/traces/{traceId}")
    public EvidenceTraceResponse decideOnTrace(
            @PathVariable UUID documentId,
            @PathVariable UUID sectionId,
            @PathVariable UUID traceId,
            @Valid @RequestBody TraceDecisionRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        PaperSection section = requireReviewSection(documentId, sectionId);
        currentUserService.requireSectionContentWriteAccess(currentUser, section);
        return evidenceTraceService.decide(documentId, sectionId, traceId, request);
    }

    @Operation(summary = "List evidence revision traces for the student's current section")
    @GetMapping("/papers/{documentId}/sections/{sectionId}/traces")
    public List<EvidenceTraceResponse> listSectionTraces(
            @PathVariable UUID documentId,
            @PathVariable UUID sectionId) {
        User currentUser = currentUserService.requireCurrentUser();
        PaperSection section = requireReviewSection(documentId, sectionId);
        currentUserService.requireSectionContentWriteAccess(currentUser, section);
        return evidenceTraceService.listSectionTraces(documentId, sectionId);
    }

    @Operation(summary = "List evidence revision traces for a project (instructor matrix)")
    @GetMapping("/projects/{projectId}/evidence-traces")
    public List<EvidenceTraceResponse> listTraces(
            @PathVariable UUID projectId,
            @RequestParam(required = false) TraceOutcome outcome) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireEvidenceTraceReviewAccess(currentUser, project);
        return evidenceTraceService.listTraces(projectId, outcome);
    }

    @Operation(summary = "Instructor judgment on an evidence revision trace")
    @PatchMapping("/projects/{projectId}/evidence-traces/{traceId}/review")
    public EvidenceTraceResponse reviewTrace(
            @PathVariable UUID projectId,
            @PathVariable UUID traceId,
            @Valid @RequestBody TraceReviewRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireEvidenceTraceReviewAccess(currentUser, project);
        return evidenceTraceService.review(projectId, traceId, request);
    }

    @Operation(summary = "Queue AI section suggestions for a saved section",
            description = "Queues a SECTION_SUGGESTION job against the review guide for this section and returns a jobId. "
                    + "Poll GET /api/jobs/{jobId} for the result.")
    @ApiResponses({
            @ApiResponse(responseCode = "202", description = "Suggestions queued"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Paper not found")
    })
    @PostMapping("/papers/{documentId}/sections/{sectionId}/suggestions")
    public ResponseEntity<JobSubmitResponse> suggestSection(
            @Parameter(description = "Paper document UUID") @PathVariable UUID documentId,
            @Parameter(description = "Section UUID") @PathVariable UUID sectionId,
            @Valid @RequestBody SectionSuggestionRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        PaperSection section = requireReviewSection(documentId, sectionId);
        currentUserService.requireProjectAccess(currentUser, section.getDocument().getProject());
        return ResponseEntity.accepted().body(aiEvaluationService.submitSectionSuggestion(
                section.getDocument().getProject().getId(),
                documentId,
                sectionId,
                request.sectionType()));
    }

    @Operation(summary = "Soft-delete a paper",
            description = "Sets the paper's active flag to false. Requires project access.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Paper soft-deleted"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Paper not found")
    })
    @DeleteMapping("/papers/{id}")
    public ResponseEntity<Void> delete(
            @Parameter(description = "Paper document UUID") @PathVariable UUID id) {
        documentService.deleteDocument(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Init paper sections from standard",
            description = "Creates a stub paper document with sections derived from the project's targetStandard. "
                    + "Idempotent — no-op if the project already has papers.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Stub paper created with standard sections"),
            @ApiResponse(responseCode = "200", description = "Project already has papers"),
            @ApiResponse(responseCode = "400", description = "No standard set on project"),
            @ApiResponse(responseCode = "404", description = "Project not found")
    })
    @PostMapping("/projects/{projectId}/papers/init")
    @Transactional
    public ResponseEntity<DocumentResponse> initPaperSections(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        // DEBT-04: authorize before any read/return so the idempotent early-return
        // below can never leak another project's paper metadata.
        var currentUser = currentUserService.requireCurrentUser();
        if (!currentUserService.isInstructor(currentUser)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only instructors can initialize paper templates.");
        }
        currentUserService.requireProjectWriteAccess(currentUser, project);
        if (project.getTargetStandard() == null) {
            return ResponseEntity.badRequest().build();
        }
        var existing = documentRepository.findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER);
        if (!existing.isEmpty()) {
            return ResponseEntity.ok(DocumentResponse.from(existing.getFirst()));
        }
        Document stub = new Document();
        stub.setProject(project);
        stub.setUploadedBy(currentUser);
        stub.setDocType(DocumentType.PAPER);
        stub.setFileUrl("placeholder");
        stub.setOriginalFilename("_standard_" + project.getTargetStandard().name() + ".tex");
        stub.setContentType("text/plain");
        stub.setFileSizeBytes(0L);
        stub.setProcessingStatus(ProcessingStatus.READY);
        stub.setActive(true);
        stub.setCreatedAt(java.time.LocalDateTime.now());
        stub.setDownloadToken(UUID.randomUUID().toString());
        stub = documentRepository.save(stub);
        paperProcessingService.createSectionsFromStandard(stub.getId(), project.getTargetStandard().name());
        checkpointService.capture(projectId, "SETUP");
        return ResponseEntity.status(HttpStatus.CREATED).body(DocumentResponse.from(stub));
    }

    @Operation(summary = "Reset paper sections to a new standard",
            description = "Atomically deletes all existing sections of the project's single paper "
                    + "and regenerates them from the specified standard. "
                    + "If no paper exists yet, creates a stub paper first (same behaviour as /init). "
                    + "Returns 409 CONFLICT if any section is currently assigned to a student.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Sections reset and recreated from new standard"),
            @ApiResponse(responseCode = "400", description = "Unknown or unsupported standard"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Insufficient permissions"),
            @ApiResponse(responseCode = "404", description = "Project not found"),
            @ApiResponse(responseCode = "409", description = "Sections have assigned students — unassign first")
    })
    @PostMapping("/projects/{projectId}/papers/reset-standard")
    public List<PaperSectionResponse> resetStandard(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId,
            @Parameter(description = "New paper standard (e.g. IEEE, ACM, APA)") @RequestParam String standard) {
        return paperProcessingService.resetSectionsForStandard(projectId, standard);
    }


    @Operation(summary = "Update paper metadata",
            description = "Updates title and/or originalFilename of a paper document.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Paper metadata updated"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Paper not found")
    })
    @PutMapping("/papers/{id}")
    public DocumentResponse updateMetadata(
            @Parameter(description = "Paper document UUID") @PathVariable UUID id,
            @Parameter(description = "New title") @RequestParam(required = false) String title,
            @Parameter(description = "New filename") @RequestParam(required = false) String originalFilename) {
        return documentService.updateDocumentMetadata(id, title, originalFilename);
    }

    @Operation(summary = "Upload a student paper",
            description = "Uploads a student paper (multipart/form-data) and queues it for "
                    + "section detection and processing.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Paper uploaded and queued for processing"),
            @ApiResponse(responseCode = "400", description = "Missing or invalid parameters"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Project not found")
    })
    @PostMapping(value = "/papers", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public ResponseEntity<DocumentResponse> upload(
            @Parameter(description = "File to upload") @RequestParam("file") MultipartFile file,
            @Parameter(description = "Project UUID") @RequestParam("projectId") UUID projectId) {

        // DEBT-04: authorize before any mutation. A failed authz must leave every row intact.
        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireProjectWriteAccess(currentUser, project);

        List<Document> existing = documentRepository
                .findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER);
        if (!existing.isEmpty()) {
            Document paper = existing.getFirst();
            List<PaperSection> sections = paperSectionRepository
                    .findByDocumentIdOrderBySectionOrderAsc(paper.getId());
            // DEBT-01: refuse to wipe a paper whose sections carry work,
            // feedback, or an open review round.
            requirePaperReplaceable(projectId, sections);
            paperSectionRepository.deleteByDocumentId(paper.getId());
            documentRepository.delete(paper);
        }

        DocumentResponse response = documentService.uploadDocument(projectId, file, DocumentType.PAPER);

        // The uploaded structure remains authoritative until the instructor confirms
        // the detected standard or explicitly keeps CUSTOM.
        project.setTargetStandard(null);
        projectRepository.save(project);

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    private void requirePaperReplaceable(UUID projectId, List<PaperSection> sections) {
        boolean hasWork = sections.stream().anyMatch(s ->
                (s.getContentTex() != null && !s.getContentTex().isBlank())
                || s.getAssignedUser() != null);
        if (hasWork) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Project already has a paper with student work. "
                    + "Delete the existing paper first.");
        }
        if (sections.stream().anyMatch(this::hasFeedback)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot replace paper: one or more sections have instructor feedback.");
        }
        boolean reviewOpen = feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(projectId).stream()
                .anyMatch(r -> r.getStatus() == FeedbackStatus.PENDING
                        || r.getStatus() == FeedbackStatus.RETURNED);
        if (reviewOpen) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot replace paper while a feedback review is open.");
        }
    }

    private boolean hasFeedback(PaperSection section) {
        return instructorFeedbackRepository
                .findByRequestProjectId(section.getDocument().getProject().getId()).stream()
                .anyMatch(f -> section.getId().equals(f.getSection().getId()));
    }

    private PaperSection requireReviewSection(UUID documentId, UUID sectionId) {
        return paperSectionRepository.findByIdWithDocument(sectionId)
                .filter(PaperSection::isActive)
                .filter(section -> documentId.equals(section.getDocument().getId()))
                .filter(section -> section.getDocument().isActive())
                .filter(section -> section.getDocument().getDocType() == DocumentType.PAPER)
                .filter(section -> section.getDocument().getProject() != null)
                .orElseThrow(() -> new ResourceNotFoundException(sectionId, "PaperSection"));
    }
}
