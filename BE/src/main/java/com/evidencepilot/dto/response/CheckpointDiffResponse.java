package com.evidencepilot.dto.response;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record CheckpointDiffResponse(
    UUID projectId,
    LocalDateTime from,
    LocalDateTime to,
    String fromTrigger,
    String toTrigger,
    Integer feedbackResolvedDelta,
    List<WordCountDelta> sectionWordDeltas
) {
    public record WordCountDelta(UUID sectionId, int fromWords, int toWords) {}
}
