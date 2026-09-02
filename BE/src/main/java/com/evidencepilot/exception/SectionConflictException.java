package com.evidencepilot.exception;

import lombok.Getter;
import java.util.UUID;

@Getter
public class SectionConflictException extends RuntimeException {
    private final UUID sectionId;
    private final Long expectedRevision;
    private final Long actualRevision;

    public SectionConflictException(UUID sectionId, Long expectedRevision, Long actualRevision) {
        super("SECTION_REVISION_CONFLICT: section " + sectionId + " was modified by another user. Expected " + expectedRevision + " but was " + actualRevision);
        this.sectionId = sectionId;
        this.expectedRevision = expectedRevision;
        this.actualRevision = actualRevision;
    }
}
