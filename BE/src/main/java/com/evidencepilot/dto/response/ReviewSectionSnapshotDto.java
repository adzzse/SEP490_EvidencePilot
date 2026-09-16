package com.evidencepilot.dto.response;

import com.evidencepilot.model.ReviewSectionSnapshot;

import java.time.LocalDateTime;
import java.util.UUID;

public record ReviewSectionSnapshotDto(
        UUID id,
        UUID requestId,
        UUID sectionId,
        String contentTex,
        Integer contentVersion,
        String snapshotType,
        LocalDateTime createdAt
) {
    public static ReviewSectionSnapshotDto from(ReviewSectionSnapshot snapshot) {
        return new ReviewSectionSnapshotDto(
                snapshot.getId(),
                snapshot.getRequest() != null ? snapshot.getRequest().getId() : null,
                snapshot.getSection() != null ? snapshot.getSection().getId() : null,
                snapshot.getContentTex(),
                snapshot.getContentVersion(),
                snapshot.getSnapshotType() == null ? null : snapshot.getSnapshotType().name(),
                snapshot.getCreatedAt());
    }
}
