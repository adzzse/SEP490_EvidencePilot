package com.evidencepilot.service;

import com.evidencepilot.model.AuditLog;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AuditSeverity;
import com.evidencepilot.repository.AuditLogRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public void record(String action, String entityType, UUID entityId, User actor, Object oldValue, Object newValue) {
        AuditLog log = new AuditLog();
        log.setAction(action);
        log.setSeverity(severityOf(action));
        log.setEntityType(entityType);
        log.setEntityId(entityId);
        log.setActor(actor);
        log.setOccurredAt(LocalDateTime.now());
        try {
            log.setOldValue(oldValue != null ? objectMapper.writeValueAsString(oldValue) : null);
            log.setNewValue(newValue != null ? objectMapper.writeValueAsString(newValue) : null);
        } catch (Exception e) {
            log.setOldValue(oldValue != null ? oldValue.toString() : null);
            log.setNewValue(newValue != null ? newValue.toString() : null);
        }
        auditLogRepository.save(log);
    }

    /**
     * Backend-owned action -> severity mapping (mirrors V26 backfill rules).
     * Suffix rules keep future actions categorized with no code or frontend
     * changes: anything *_FAILED/_BANNED/_DELETED is CRITICAL, expiries and
     * rejections are WARN, everything else is INFO.
     */
    static AuditSeverity severityOf(String action) {
        if (action == null) {
            return AuditSeverity.INFO;
        }
        if (action.endsWith("_BANNED") || action.endsWith("_DELETED") || action.endsWith("_FAILED")) {
            return AuditSeverity.CRITICAL;
        }
        if (action.endsWith("_EXPIRED") || action.endsWith("_REJECTED") || action.endsWith("_RETURNED")
                || action.equals("PASSWORD_RESET_REQUESTED")) {
            return AuditSeverity.WARN;
        }
        return AuditSeverity.INFO;
    }
}
