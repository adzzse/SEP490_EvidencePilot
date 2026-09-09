package com.evidencepilot.controller;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.EvidenceRevisionTrace;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.repository.AuditLogRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.BufferedWriter;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Streaming CSV backup — no POI, no heap StringBuilder.
 * Reuses ExportServiceImpl row-escaping pattern, streams directly to response.
 */
@RestController
@RequestMapping("/api/admin/backup")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@Tag(name = "Administration", description = "CSV backup streaming")
public class AdminBackupController {

    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final DocumentRepository documentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final EvidenceRevisionTraceRepository traceRepository;
    private final AuditLogRepository auditLogRepository;

    @GetMapping(value = "/csv", produces = "text/csv")
    public ResponseEntity<StreamingResponseBody> backupCsv(@RequestParam(required = false) UUID projectId) {
        String filename = "backup-" + LocalDate.now() + (projectId == null ? "-all" : "-" + projectId) + ".csv";
        StreamingResponseBody body = out -> {
            try (BufferedWriter w = new BufferedWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8))) {
                w.write('\uFEFF');
                w.write("TABLE,ID,EXTRA\n");
                userRepository.findAll().forEach(u -> write(w, "users", u.getId().toString(), u.getEmail() + "," + u.getRole()));
                projectRepository.findAll().forEach(p -> {
                    if (projectId != null && !p.getId().equals(projectId)) return;
                    write(w, "projects", p.getId().toString(), esc(p.getTitle()) + "," + p.getStatus());
                });
                documentRepository.findAll().forEach(d -> {
                    if (projectId != null && d.getProject() != null && !d.getProject().getId().equals(projectId)) return;
                    write(w, "documents", d.getId().toString(), d.getDocType() + "," + esc(d.getOriginalFilename()));
                });
                if (projectId == null) {
                    paperSectionRepository.findAll().forEach(s -> write(w, "paper_sections", s.getId().toString(), esc(s.getSectionTitle())));
                    traceRepository.findAll().forEach(t -> write(w, "evidence_traces", t.getId().toString(), String.valueOf(t.getFindingIndex())));
                    auditLogRepository.findAll().forEach(a -> write(w, "audit_logs", a.getId().toString(), String.valueOf(a.getAction())));
                } else {
                    for (Document paper : documentRepository.findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER)) {
                        for (PaperSection s : paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId())) {
                            write(w, "paper_sections", s.getId().toString(), esc(s.getSectionTitle()));
                        }
                    }
                    for (EvidenceRevisionTrace t : traceRepository.findByProjectIdOrderByCreatedAtDesc(projectId)) {
                        write(w, "evidence_traces", t.getId().toString(), String.valueOf(t.getFindingIndex()));
                    }
                }
                // ponytail: password_hash, tokens, MAIL_* never exported
                w.flush();
            }
        };
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
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
