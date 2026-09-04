package com.evidencepilot.dto.response;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record ReviewReadinessResponse(
        String state,
        boolean canSubmit,
        String submissionFingerprint,
        List<Check> checks,
        List<Paper> papers
) {
    public record Check(
            String code,
            String status,
            String message,
            List<String> resourceIds
    ) {}

    public record Paper(
            UUID id,
            String title,
            String processingStatus,
            List<Section> sections
    ) {}

    public record Section(
            UUID id,
            UUID paperId,
            String title,
            Integer order,
            Integer contentVersion,
            Long revision,
            UUID assignedUserId,
            String assignedUserName,
            String currentInputFingerprint,
            String handoffState,
            UUID confirmedById,
            String confirmedByName,
            LocalDateTime confirmedAt,
            Integer confirmedContentVersion,
            List<String> blockers
    ) {}
}
