package com.evidencepilot.controller;

import com.evidencepilot.dto.response.JobResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.AiEvaluationService;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Jobs", description = "Async AI evaluation job status")
public class JobController {

    private final AiEvaluationService aiEvaluationService;
    private final ProjectRepository projectRepository;
    private final CurrentUserServiceImpl currentUserService;

    @Operation(summary = "Get AI evaluation job status",
            description = "Returns the status and result of an async AI evaluation job. "
                    + "PENDING/PROCESSING while running, SUCCESS with the result payload, "
                    + "FAILED with an error message. Access is limited to project members.")
    @GetMapping("/jobs/{jobId}")
    public JobResponse getJob(
            @Parameter(description = "Job UUID") @PathVariable UUID jobId) {
        JobResponse job = aiEvaluationService.getJob(jobId);
        currentUserService.requireProjectAccess(
                currentUserService.requireCurrentUser(),
                projectRepository.findById(job.projectId())
                        .orElseThrow(() -> new ResourceNotFoundException(job.projectId(), "Project")));
        return job;
    }
}
