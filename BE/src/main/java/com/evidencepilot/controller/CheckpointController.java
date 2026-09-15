package com.evidencepilot.controller;

import com.evidencepilot.dto.response.CheckpointDiffResponse;
import com.evidencepilot.dto.response.CheckpointSectionBaselineResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.impl.CheckpointServiceImpl;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;
import java.util.UUID;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
@Tag(name = "Checkpoints", description = "Project checkpoints and diff between review milestones")
public class CheckpointController {

    private final CheckpointServiceImpl checkpointService;
    private final ProjectRepository projectRepository;
    private final CurrentUserServiceImpl currentUserService;

    @Operation(summary = "Get diff between the two latest project checkpoints",
            description = "Compares the two most recent checkpoints using per-section word count "
                    + "deltas and the answered feedback delta.")
    @GetMapping("/{projectId}/checkpoints/diff")
    public CheckpointDiffResponse getDiff(@PathVariable UUID projectId) {
        currentUserService.requireProjectAccess(
                currentUserService.requireCurrentUser(),
                projectRepository.findById(projectId)
                        .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project")));
        return checkpointService.getDiff(projectId);
    }

    @Operation(summary = "Get latest checkpoint section baseline",
            description = "Returns the section content as captured in the newest checkpoint created "
                    + "strictly before the optional 'before' timestamp (defaults to the latest). Pass the "
                    + "requestedAt of the submission being reviewed so the checkpoint created by that "
                    + "submission is excluded. 404 when no matching checkpoint exists or the section "
                    + "was not captured.")
    @GetMapping("/{projectId}/checkpoints/latest/sections/{sectionId}")
    public ResponseEntity<CheckpointSectionBaselineResponse> getLatestSectionBaseline(
            @PathVariable UUID projectId,
            @PathVariable UUID sectionId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime before) {
        currentUserService.requireProjectAccess(
                currentUserService.requireCurrentUser(),
                projectRepository.findById(projectId)
                        .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project")));
        CheckpointSectionBaselineResponse baseline = checkpointService
                .getLatestSectionBaseline(projectId, sectionId, before);
        return baseline == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(baseline);
    }
}
