package com.evidencepilot.service;

import com.evidencepilot.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Phase C: detects uploads that succeeded without their DOCUMENT_UPLOADED
 * audit row (the upload path treats auditing as best-effort so a logging
 * failure never rolls back the file write).
 *
 * <p>Orphans are surfaced via a warning log for ops alerting. No automatic
 * backfill: a fabricated row would misrepresent occurredAt. Run
 * {@link AuditLogRepository#findActiveDocumentIdsMissingUploadAudit()} to
 * review the current gap set.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class UploadAuditReconciler {

    private final AuditLogRepository auditLogs;

    @Scheduled(cron = "${app.audit.upload-reconcile-cron:0 30 3 * * *}")
    public void reconcile() {
        List<UUID> orphans = auditLogs.findActiveDocumentIdsMissingUploadAudit();
        if (!orphans.isEmpty()) {
            log.warn("upload_audit_gap count={} documentIds={}", orphans.size(), orphans);
        }
    }
}
