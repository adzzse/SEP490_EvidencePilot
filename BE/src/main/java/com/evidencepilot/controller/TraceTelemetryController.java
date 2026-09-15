package com.evidencepilot.controller;

import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.dto.response.TraceTelemetryResponse;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.service.TraceTelemetryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/projects/{projectId}")
@RequiredArgsConstructor
@Tag(name = "Telemetry", description = "Per-round HITL telemetry")
public class TraceTelemetryController {

    private final TraceTelemetryService traceTelemetryService;
    private final CurrentUserServiceImpl currentUserService;
    private final ProjectRepository projectRepository;

    @Operation(summary = "Per-round HITL telemetry for a project")
    @GetMapping("/telemetry")
    public TraceTelemetryResponse telemetry(
            @PathVariable UUID projectId) {
        currentUserService.requireEvidenceTraceReviewAccess(
                currentUserService.requireCurrentUser(),
                projectRepository.findById(projectId)
                        .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project")));
        return traceTelemetryService.telemetry(projectId);
    }
}
