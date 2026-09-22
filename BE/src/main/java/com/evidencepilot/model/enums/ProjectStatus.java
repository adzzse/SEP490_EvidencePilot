package com.evidencepilot.model.enums;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Project lifecycle state machine.
 *
 * <pre>
 * CREATED -> ASSIGNED -> IN_PROGRESS -> SUBMITTED_FOR_REVIEW -> APPROVED -> ARCHIVED
 *                             ^                |                    |
 *                             |                v                    v
 *                             +---------- RETURNED             (unarchive)
 *                                              |
 *                                              +-> SUBMITTED_FOR_REVIEW (student resubmits)
 * </pre>
 *
 * Any writable status (CREATED, ASSIGNED, IN_PROGRESS, RETURNED) may move to
 * PENDING_DELETE when deletion is scheduled; revoking restores the stored
 * pre-deletion status. RETURNED is a writable state: students revise and
 * resubmit. APPROVED, ARCHIVED and PENDING_DELETE are read-only.
 */
public enum ProjectStatus {
    CREATED, ASSIGNED, IN_PROGRESS, SUBMITTED_FOR_REVIEW, RETURNED, APPROVED, ARCHIVED, PENDING_DELETE;

    private static final Map<ProjectStatus, Set<ProjectStatus>> LEGAL_TRANSITIONS = Map.of(
            CREATED, EnumSet.of(ASSIGNED, PENDING_DELETE),
            ASSIGNED, EnumSet.of(IN_PROGRESS, SUBMITTED_FOR_REVIEW, PENDING_DELETE),
            IN_PROGRESS, EnumSet.of(SUBMITTED_FOR_REVIEW, APPROVED, PENDING_DELETE),
            SUBMITTED_FOR_REVIEW, EnumSet.of(RETURNED, APPROVED, IN_PROGRESS),
            RETURNED, EnumSet.of(SUBMITTED_FOR_REVIEW, IN_PROGRESS, PENDING_DELETE),
            APPROVED, EnumSet.of(ARCHIVED),
            ARCHIVED, EnumSet.of(APPROVED),
            PENDING_DELETE, EnumSet.of(CREATED, ASSIGNED, IN_PROGRESS, RETURNED));

    public boolean isReadOnly() {
        return this == APPROVED || this == ARCHIVED || this == PENDING_DELETE;
    }

    /** Returns true when the state machine permits moving from this status to {@code target}. */
    public boolean canTransitionTo(ProjectStatus target) {
        return target != null
                && LEGAL_TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
    }
}
