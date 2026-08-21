package com.evidencepilot.controller;

import com.evidencepilot.dto.response.ProgressReportResponse;
import com.evidencepilot.service.ProgressReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
@Tag(name = "Progress Report", description = "Project progress report and traceability matrix")
public class ProgressReportController {

    private final ProgressReportService progressReportService;

    @Operation(summary = "Get project progress report",
            description = "Returns project readiness, current section assignment, and recorded edit evidence. "
                    + "Filter current sections and contribution evidence by memberFilter.")
    @GetMapping("/{projectId}/progress-report")
    public ProgressReportResponse getProgressReport(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId,
            @Parameter(description = "ALL or a Student UUID to filter contribution evidence")
            @RequestParam(value = "memberFilter", required = false) String memberFilter) {
        return progressReportService.getProgressReport(projectId, memberFilter);
    }
}
