package com.evidencepilot.controller;

import com.evidencepilot.dto.response.TraceabilityExportResponse;
import com.evidencepilot.service.impl.TraceabilityExportServiceImpl;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
@Tag(name = "Traceability", description = "Project-level traceability export")
public class TraceabilityExportController {

    private final TraceabilityExportServiceImpl traceabilityExportService;

    @Operation(summary = "Export project traceability",
            description = "Generates a project traceability export containing sections, sources, "
                    + "reference counts, and feedback history.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Traceability export returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Access denied"),
            @ApiResponse(responseCode = "404", description = "Project not found")
    })
    @GetMapping("/{projectId}/traceability")
    public TraceabilityExportResponse export(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId) {
        return traceabilityExportService.exportTraceability(projectId);
    }

    @Operation(summary = "Export project traceability as CSV",
            description = "Generates a CSV download of project sections, sources, and feedback history.")
    @GetMapping("/{projectId}/traceability/csv")
    public ResponseEntity<byte[]> exportCsv(
            @Parameter(description = "Project UUID") @PathVariable UUID projectId) {
        byte[] csv = traceabilityExportService.exportTraceabilityCsv(projectId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"traceability.csv\"")
                .contentType(MediaType.parseMediaType("text/csv;charset=utf-8"))
                .body(csv);
    }
}
