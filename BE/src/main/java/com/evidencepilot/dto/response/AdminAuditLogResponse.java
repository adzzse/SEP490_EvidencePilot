package com.evidencepilot.dto.response;

import com.evidencepilot.model.AuditLog;
import com.evidencepilot.model.User;

import java.time.LocalDateTime;
import java.util.UUID;

public record AdminAuditLogResponse(
        UUID actorId,
        String actorEmail,
        String action,
        String severity,
        String entityType,
        UUID entityId,
        String oldValue,
        String newValue,
        LocalDateTime occurredAt) {

    public static AdminAuditLogResponse from(AuditLog log) {
        User actor = log.getActor();
        return new AdminAuditLogResponse(
                actor != null ? actor.getId() : null,
                actor != null ? actor.getEmail() : null,
                log.getAction(),
                log.getSeverity() != null ? log.getSeverity().name() : null,
                log.getEntityType(),
                log.getEntityId(),
                log.getOldValue(),
                log.getNewValue(),
                log.getOccurredAt());
    }
}
