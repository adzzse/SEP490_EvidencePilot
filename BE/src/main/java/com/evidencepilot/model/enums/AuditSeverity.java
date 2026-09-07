package com.evidencepilot.model.enums;

/**
 * Backend-owned audit severity. Resolved in {@code AuditService} from the
 * action name — the frontend renders {@code severity} verbatim and never
 * categorizes actions itself, so new actions need no frontend deploy.
 */
public enum AuditSeverity {
    INFO,
    WARN,
    CRITICAL
}
