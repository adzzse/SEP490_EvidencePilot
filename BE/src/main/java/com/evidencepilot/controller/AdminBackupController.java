package com.evidencepilot.controller;

import com.evidencepilot.model.Project;
import com.evidencepilot.repository.AuditLogRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AdminSeedExportService;
import com.evidencepilot.service.DocumentObjectStorage;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import org.springframework.web.server.ResponseStatusException;

import java.io.BufferedWriter;
import java.io.OutputStreamWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;
import java.util.function.Function;

/**
 * Administrative CSV data export. Not a complete backup or restore format.
 */
@RestController
@RequestMapping("/api/admin/backup")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@Tag(name = "Administration", description = "CSV data export")
public class AdminBackupController {

    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final DocumentRepository documentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final EvidenceRevisionTraceRepository traceRepository;
    private final AuditLogRepository auditLogRepository;
    private final AdminSeedExportService seedExportService;
    private final DocumentObjectStorage documentObjectStorage;

    @GetMapping(value = "/csv", produces = "text/csv")
    public ResponseEntity<StreamingResponseBody> backupCsv(@RequestParam(required = false) UUID projectId) {
        Project selected = projectId == null ? null : projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        String filename = "backup-" + LocalDate.now() + (projectId == null ? "-all" : "-" + projectId) + ".csv";
        StreamingResponseBody body = out -> {
            try (BufferedWriter w = new BufferedWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8))) {
                w.write('\uFEFF');
                w.write("TABLE,ID,EXTRA\n");
                writePages(w, "users", page -> projectId == null ? userRepository.findAll(page) : userRepository.findForExport(projectId, page),
                        u -> new String[]{u.getId().toString(), u.getEmail() + "," + u.getRole()});
                if (selected == null) writePages(w, "projects", projectRepository::findAll,
                        p -> new String[]{p.getId().toString(), p.getTitle() + "," + p.getStatus()});
                else write(w, "projects", selected.getId().toString(), selected.getTitle() + "," + selected.getStatus());
                writePages(w, "documents", page -> projectId == null ? documentRepository.findAll(page) : documentRepository.findByProjectId(projectId, page),
                        d -> new String[]{d.getId().toString(), d.getDocType() + "," + d.getOriginalFilename()});
                writePages(w, "paper_sections", page -> projectId == null ? paperSectionRepository.findAll(page) : paperSectionRepository.findForExport(projectId, page),
                        s -> new String[]{s.getId().toString(), s.getSectionTitle()});
                writePages(w, "evidence_traces", page -> projectId == null ? traceRepository.findAll(page) : traceRepository.findForExport(projectId, page),
                        t -> new String[]{t.getId().toString(), String.valueOf(t.getFindingIndex())});
                writePages(w, "audit_logs", page -> projectId == null ? auditLogRepository.findAll(page) : auditLogRepository.findForExport(projectId, page),
                        a -> new String[]{a.getId().toString(), a.getAction()});
                w.flush();
            }
        };
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(body);
    }

    @GetMapping(value = "/seed-bundle", produces = "application/zip")
    public ResponseEntity<StreamingResponseBody> backupSeedBundle(
            @RequestParam(required = false) UUID projectId) throws java.io.IOException {
        AdminSeedExportService.SeedBundle bundle = seedExportService.buildBundle(projectId);
        String filename = "seed-backup-" + LocalDate.now()
                + (projectId == null ? "-all" : "-" + projectId) + ".zip";
        StreamingResponseBody body = out -> {
            try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(
                    out, StandardCharsets.UTF_8)) {
                zip.putNextEntry(new java.util.zip.ZipEntry("seed.xlsx"));
                zip.write(bundle.xlsx());
                zip.closeEntry();
                for (AdminSeedExportService.PaperFileEntry file : bundle.paperFiles()) {
                    try (java.io.InputStream in = documentObjectStorage.getStream(file.objectKey())) {
                        if (in == null) continue;
                        zip.putNextEntry(new java.util.zip.ZipEntry(file.zipPath()));
                        in.transferTo(zip);
                        zip.closeEntry();
                    } catch (Exception e) {
                        throw new IllegalStateException("Backup missing paper file: " + file.zipPath(), e);
                    }
                }
            }
        };
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(new MediaType("application", "zip", StandardCharsets.UTF_8))
                .body(body);
    }

    private static void write(BufferedWriter w, String table, String id, String extra) {
        try {
            w.write(table + "," + id + "," + (extra == null ? "" : extra.replaceAll("[\\r\\n]+", " ")) + "\n");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String esc(String s) {
        if (s == null) return "";
        String v = s.replaceAll("[\\r\\n]+", " ");
        if (v.contains(",") || v.contains("\"")) return "\"" + v.replace("\"", "\"\"") + "\"";
        return v;
    }


}
