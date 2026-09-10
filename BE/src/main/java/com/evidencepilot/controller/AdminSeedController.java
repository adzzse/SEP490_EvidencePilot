package com.evidencepilot.controller;

import com.evidencepilot.service.AdminExcelSeedService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * ADMIN-only Excel/ZIP seed. Silent rows require explicit local/test policy;
 * one reserved import owns its temporary files through worker completion.
 */
@RestController
@RequestMapping("/api/admin/seed")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@Tag(name = "Administration", description = "Excel/ZIP data seeding")
public class AdminSeedController {

    private final AdminExcelSeedService excelSeedService;

    @GetMapping("/template")
    public ResponseEntity<byte[]> template() throws Exception {
        byte[] bundle = excelSeedService.buildTemplateBundle();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"seed-template-bundle.zip\"")
                .contentType(MediaType.parseMediaType("application/zip"))
                .body(bundle);
    }

    @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> preview(@RequestParam("file") MultipartFile file) throws Exception {
        AdminExcelSeedService.ParsedSeed parsed;
        try (var in = file.getInputStream()) {
            parsed = excelSeedService.parse(in, file.getSize());
        }
        Map<String, Object> rows = new LinkedHashMap<>();
        parsed.sheets().forEach((k, v) -> rows.put(k, v.size()));
        long invited = parsed.sheets().getOrDefault("users", List.of()).stream()
                .filter(r -> AdminExcelSeedService.sendInvitationRequested(r.getOrDefault("send_invitation", "")))
                .count();
        int userRows = parsed.sheets().getOrDefault("users", List.of()).size();
        Map<String, Object> invitations =
                Map.of("willInvite", (int) invited, "silentActive", userRows - (int) invited);
        long uniqueDois = parsed.sheets().getOrDefault("sources", List.of()).stream()
                .map(r -> com.evidencepilot.client.openalex.DoiUtils.normalize(r.getOrDefault("doi", "")))
                .filter(d -> d != null && !d.isBlank())
                .distinct()
                .count();
        return ResponseEntity.ok(Map.of("rows", rows, "invitations", invitations,
                "uniqueDois", (int) uniqueDois,
                "errors", parsed.errors(), "valid", parsed.errors().isEmpty()));
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) throws Exception {
        if (!excelSeedService.tryReserveImport()) return busy();
        boolean submitted = false;
        try {
            excelSeedService.checkUploadSize(file.getSize());
            byte[] xlsx;
            try (var in = file.getInputStream()) {
                xlsx = excelSeedService.readXlsx(in, file.getSize());
            }
            var job = excelSeedService.submit(xlsx,
                    new AdminExcelSeedService.ZipBundle(Map.of(), List.of()), null);
            submitted = true;
            return ResponseEntity.accepted().body(Map.of("jobId", job.getId().toString(), "status", job.getStatus()));
        } finally {
            if (!submitted) excelSeedService.releaseImport();
        }
    }

    @PostMapping(value = "/upload-zip", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> uploadZip(@RequestParam("file") MultipartFile file) throws Exception {
        if (!excelSeedService.tryReserveImport()) return busy();
        boolean submitted = false;
        AdminExcelSeedService.ZipBundle bundle = null;
        try {
            excelSeedService.checkUploadSize(file.getSize());
            try (var in = file.getInputStream()) {
                bundle = excelSeedService.readZip(in);
            }
            if (!bundle.errors().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("errors", bundle.errors()));
            }
            var candidates = bundle.files().entrySet().stream()
                    .filter(e -> e.getKey().toLowerCase(java.util.Locale.ROOT).endsWith(".xlsx") && !e.getKey().contains("/"))
                    .toList();
            if (candidates.size() != 1) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ZIP must contain exactly one XLSX at root");
            }
            var selected = candidates.getFirst();
            byte[] xlsx;
            try (var in = java.nio.file.Files.newInputStream(selected.getValue())) {
                xlsx = excelSeedService.readXlsx(in, java.nio.file.Files.size(selected.getValue()));
            }
            Map<String, java.nio.file.Path> rest = new LinkedHashMap<>(bundle.files());
            rest.remove(selected.getKey());
            var job = excelSeedService.submit(xlsx,
                    new AdminExcelSeedService.ZipBundle(rest, List.of(), bundle.spoolDir()), null);
            submitted = true;
            return ResponseEntity.accepted().body(Map.of("jobId", job.getId().toString(), "status", job.getStatus()));
        } finally {
            if (!submitted) {
                if (bundle != null) AdminExcelSeedService.deleteSpoolDir(bundle.spoolDir());
                excelSeedService.releaseImport();
            }
        }
    }

    private ResponseEntity<Map<String, Object>> busy() {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, "5")
                .body(Map.of("errors", List.of("A seed import is already running; retry after it finishes")));
    }

    @GetMapping("/jobs/{jobId}")
    public ResponseEntity<Map<String, Object>> job(@PathVariable UUID jobId) {
        var job = excelSeedService.get(jobId);
        if (job == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Seed job not found");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("jobId", job.getId().toString());
        body.put("status", job.getStatus());
        body.put("total", job.getTotal());
        body.put("processed", job.getProcessed());
        body.put("complete", job.isComplete());
        body.put("successfulRows", job.getSuccessfulRows());
        body.put("failedRows", job.getFailedRows());
        body.put("skippedRows", job.getSkippedRows());
        body.put("currentStep", job.getCurrentStep());
        body.put("progress", job.getTotal() == 0 ? 0 : (int) (100L * job.getProcessed() / Math.max(1, job.getTotal())));
        body.put("errors", job.getErrors());
        body.put("result", job.getResult());
        return ResponseEntity.ok(body);
    }


}
