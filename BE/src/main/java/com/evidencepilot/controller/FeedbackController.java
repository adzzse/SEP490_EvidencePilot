package com.evidencepilot.controller;

import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.request.SubmitReviewRequest;
import com.evidencepilot.dto.response.ComparisonSourceDto;
import com.evidencepilot.dto.response.FeedbackRequestResponseDto;
import com.evidencepilot.dto.response.InstructorFeedbackResponseDto;
import com.evidencepilot.service.impl.FeedbackServiceImpl;
import com.evidencepilot.dto.response.ReviewReadinessResponse;
import com.evidencepilot.dto.response.ReviewSubmissionSnapshotResponse;
import com.evidencepilot.service.impl.FeedbackServiceImpl;
import com.evidencepilot.service.SubmissionReadinessService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Feedback", description = "Feedback request lifecycle and instructor review")
public class FeedbackController {

    private final FeedbackServiceImpl feedbackService;
    private final SubmissionReadinessService submissionReadinessService;

    @Operation(summary = "List feedback requests",
            description = "Returns all feedback requests scoped to the current user. "
                    + "Admins see all; instructors see requests assigned to them; students see their own.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Feedback request list returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT")
    })
    @GetMapping("/feedback-requests")
    public List<FeedbackRequestResponseDto> findAll() {
        return feedbackService.findAllForCurrentUser();
    }

    @Operation(summary = "Submit project for review",
            description = "Creates a PENDING feedback request for the specified instructor. "
                    + "Sets the project status to IN_REVIEW. The current user is extracted from the JWT.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Feedback request created"),
            @ApiResponse(responseCode = "400", description = "Project has no instructor or student"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Insufficient permissions"),
            @ApiResponse(responseCode = "404", description = "Project or instructor not found")
    })
    @PostMapping("/projects/{projectId}/reviews")
    public ResponseEntity<FeedbackRequestResponseDto> submitForReview(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId,
            @Valid @RequestBody SubmitReviewRequest request) {
        FeedbackRequestResponseDto response = feedbackService.submitForReview(projectId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/projects/{projectId}/review-readiness")
    public ReviewReadinessResponse getReviewReadiness(@PathVariable UUID projectId) {
        return submissionReadinessService.readiness(projectId);
    }

    @GetMapping("/feedback-requests/{id}/submission-snapshot")
    public ReviewSubmissionSnapshotResponse getSubmissionSnapshot(@PathVariable UUID id) {
        return feedbackService.getSubmissionSnapshot(id);
    }

    @Operation(summary = "Get review section snapshots",
            description = "Returns the BASELINE (at Return for Revision) and SUBMITTED "
                    + "(at Submit for Review) per-section snapshots for one review request. "
                    + "The diff view compares only these two rows — never save history.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Snapshots returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Not the request's instructor or student"),
            @ApiResponse(responseCode = "404", description = "Feedback request not found")
    })
    @GetMapping("/feedback-requests/{id}/section-snapshots")
    public List<com.evidencepilot.dto.response.ReviewSectionSnapshotDto> getSectionSnapshots(
            @Parameter(description = "Feedback request UUID") @PathVariable UUID id,
            @Parameter(description = "Optional paper section UUID") @RequestParam(required = false) UUID sectionId) {
        return feedbackService.getSectionSnapshots(id, sectionId);
    }

    @Operation(summary = "Get revision comparison source",
            description = "Returns the active request's SUBMITTED section content together with "
                    + "its comparison baseline: the latest earlier RETURNED request's BASELINE "
                    + "row for the section, else the initial assignment baseline, else null "
                    + "(honest unavailable — never invented). The diff view consumes this "
                    + "instead of comparing rows within a single request.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Comparison source returned"),
            @ApiResponse(responseCode = "400", description = "Section does not belong to the project"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Not the request's instructor or student"),
            @ApiResponse(responseCode = "404", description = "Feedback request not found"),
            @ApiResponse(responseCode = "409", description = "Active review has no submitted snapshot")
    })
    @GetMapping("/feedback-requests/{id}/comparison-source")
    public ComparisonSourceDto getComparisonSource(
            @Parameter(description = "Feedback request UUID") @PathVariable UUID id,
            @Parameter(description = "Paper section UUID") @RequestParam UUID sectionId) {
        return feedbackService.getComparisonSource(id, sectionId);
    }

    @Operation(summary = "Submit instructor feedback",
            description = "Creates instructor feedback for one paper section in a feedback request. "
                    + "The current user is extracted from the JWT.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Feedback saved"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Not the assigned instructor"),
            @ApiResponse(responseCode = "404", description = "Feedback request not found")
    })
    @PostMapping("/feedback-requests/{id}/feedback")
    public InstructorFeedbackResponseDto comment(
            @Parameter(description = "Feedback request UUID") @PathVariable UUID id,
            @Valid @RequestBody InstructorFeedbackRequest request) {
        return feedbackService.comment(id, request);
    }

    @Operation(summary = "List feedback items for a request",
            description = "Returns the per-section feedback items of one feedback request, "
                    + "each with section title/order, the section version it was written against, "
                    + "and a stale flag when the section has been edited since. "
                    + "Student members only receive sections assigned to them; leaders, "
                    + "instructors and admins may additionally filter by section.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Feedback items returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Not the request's instructor or student, or section not assigned to the member"),
            @ApiResponse(responseCode = "404", description = "Feedback request not found")
    })
    @GetMapping("/feedback-requests/{id}/feedback")
    public List<InstructorFeedbackResponseDto> getFeedbackItems(
            @Parameter(description = "Feedback request UUID") @PathVariable UUID id,
            @Parameter(description = "Optional paper section UUID") @RequestParam(required = false) UUID sectionId) {
        return feedbackService.getFeedbackItems(id, sectionId);
    }

    @Operation(summary = "Edit a feedback item",
            description = "Author-instructor only, request must be PENDING; updates content and lineReference. "
                    + "Answered items are immutable.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Feedback updated"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Not the author instructor"),
            @ApiResponse(responseCode = "404", description = "Feedback item not found")
    })
    @PatchMapping("/instructor-feedback/{id}")
    public InstructorFeedbackResponseDto updateFeedbackItem(
            @Parameter(description = "Instructor feedback item UUID") @PathVariable UUID id,
            @Valid @RequestBody InstructorFeedbackRequest request) {
        return feedbackService.updateFeedbackItem(id, request);
    }

    @Operation(summary = "Delete a feedback item",
            description = "Author-instructor only, request must be PENDING; answered items are immutable.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Feedback deleted"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Not the author instructor"),
            @ApiResponse(responseCode = "404", description = "Feedback item not found")
    })
    @DeleteMapping("/instructor-feedback/{id}")
    public ResponseEntity<Void> deleteFeedbackItem(
            @Parameter(description = "Instructor feedback item UUID") @PathVariable UUID id) {
        feedbackService.deleteFeedbackItem(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Get a single feedback thread",
            description = "Returns one thread with its replies and attachments. "
                    + "Students cannot see unpublished drafts.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Thread returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Feedback thread not found")
    })
    @GetMapping("/instructor-feedback/{id}")
    public InstructorFeedbackResponseDto getThread(
            @Parameter(description = "Instructor feedback thread UUID") @PathVariable UUID id) {
        return feedbackService.getThread(id);
    }

    @Operation(summary = "Update feedback request status",
            description = "Transitions a feedback request to a new status (RETURNED or REVIEWED). "
                    + "Request-level REJECTED is retired: stored REJECTED rows remain readable, "
                    + "but new transitions to REJECTED are rejected. Replaces the old RPC-style status endpoints.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Status updated"),
            @ApiResponse(responseCode = "400", description = "Invalid status value"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Not the assigned instructor"),
            @ApiResponse(responseCode = "404", description = "Feedback request not found"),
            @ApiResponse(responseCode = "409", description = "Illegal or retired transition")
    })
    @PatchMapping("/feedback-requests/{id}/status")
    public FeedbackRequestResponseDto updateStatus(
            @Parameter(description = "Feedback request UUID") @PathVariable UUID id,
            @Parameter(description = "New status: RETURNED or REVIEWED") @RequestParam String status) {
        return feedbackService.updateStatus(id, status);
    }
}
