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
 * Manual seed — pure ADMIN function (no @Profile, no APP_ENV gate on manual
 * path; auto boot seeder stays profile-gated). Excel multi-sheet + folder-
 * per-paper ZIP bundle, async jobs with progress polling.
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
        var parsed = excelSeedService.parse(file.getInputStream(), file.getSize());
        Map<String, Object> rows = new LinkedHashMap<>();
        parsed.sheets().forEach((k, v) -> rows.put(k, v.size()));
        long invited = parsed.sheets().getOrDefault("users", List.of()).stream()
                .filter(r -> AdminExcelSeedService.sendInvitationRequested(r.getOrDefault("send_invitation", "")))
                .count();
        int userRows = parsed.sheets().getOrDefault("users", List.of()).size();
        Map<String, Object> invitations =
                Map.of("willInvite", (int) invited, "silentActive", userRows - (int) invited);
        return ResponseEntity.ok(Map.of("rows", rows, "invitations", invitations,
                "errors", parsed.errors(), "valid", parsed.errors().isEmpty()));
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) throws Exception {
        byte[] xlsx = file.getBytes();
        var job = excelSeedService.submit(xlsx,
                new AdminExcelSeedService.ZipBundle(Map.of(), List.of()), null);
        return ResponseEntity.accepted().body(Map.of("jobId", job.getId().toString(), "status", job.getStatus()));
    }

    @PostMapping(value = "/upload-zip", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> uploadZip(@RequestParam("file") MultipartFile file) throws Exception {
        var bundle = excelSeedService.readZip(file.getInputStream());
        if (!bundle.errors().isEmpty()) {
            AdminExcelSeedService.deleteSpoolDir(bundle.spoolDir());
            return ResponseEntity.badRequest().body(Map.of("errors", bundle.errors()));
        }
        java.nio.file.Path xlsxPath = bundle.files().get("seed.xlsx");
        if (xlsxPath == null) {
            // fallback: first xlsx at root
            xlsxPath = bundle.files().entrySet().stream()
                    .filter(e -> e.getKey().toLowerCase(java.util.Locale.ROOT).endsWith(".xlsx") && !e.getKey().contains("/"))
                    .map(Map.Entry::getValue).findFirst()
                    .orElse(null);
        }
        if (xlsxPath == null) {
            AdminExcelSeedService.deleteSpoolDir(bundle.spoolDir());
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ZIP must contain seed.xlsx at root");
        }
        byte[] xlsx = java.nio.file.Files.readAllBytes(xlsxPath);
        Map<String, java.nio.file.Path> rest = new LinkedHashMap<>(bundle.files());
        rest.remove("seed.xlsx");
        var job = excelSeedService.submit(xlsx,
                new AdminExcelSeedService.ZipBundle(rest, List.of(), bundle.spoolDir()), null);
        return ResponseEntity.accepted().body(Map.of("jobId", job.getId().toString(), "status", job.getStatus()));
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
        body.put("currentStep", job.getCurrentStep());
        body.put("progress", job.getTotal() == 0 ? 0 : (int) (100L * job.getProcessed() / Math.max(1, job.getTotal())));
        body.put("errors", job.getErrors());
        body.put("result", job.getResult());
        return ResponseEntity.ok(body);
    }


}
