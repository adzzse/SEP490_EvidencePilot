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
 * RETURNED is a writable state: students revise and resubmit. Only APPROVED and
 * ARCHIVED are read-only.
 */
public enum ProjectStatus {
    CREATED, ASSIGNED, IN_PROGRESS, SUBMITTED_FOR_REVIEW, RETURNED, APPROVED, ARCHIVED;

    private static final Map<ProjectStatus, Set<ProjectStatus>> LEGAL_TRANSITIONS = Map.of(
            CREATED, EnumSet.of(ASSIGNED),
            ASSIGNED, EnumSet.of(IN_PROGRESS, SUBMITTED_FOR_REVIEW),
            IN_PROGRESS, EnumSet.of(SUBMITTED_FOR_REVIEW, APPROVED),
            SUBMITTED_FOR_REVIEW, EnumSet.of(RETURNED, APPROVED, IN_PROGRESS),
            RETURNED, EnumSet.of(SUBMITTED_FOR_REVIEW, IN_PROGRESS),
            APPROVED, EnumSet.of(ARCHIVED),
            ARCHIVED, EnumSet.of(APPROVED));

    public boolean isReadOnly() {
        return this == APPROVED || this == ARCHIVED;
    }

    /** Returns true when the state machine permits moving from this status to {@code target}. */
    public boolean canTransitionTo(ProjectStatus target) {
        return target != null
                && LEGAL_TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
    }
}
