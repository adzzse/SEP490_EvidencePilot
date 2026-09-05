package com.evidencepilot.dto.response;

import java.time.LocalDateTime;
import java.util.UUID;

public record ActivityFeedItem(
        String type,
        UUID entityId,
        UUID projectId,
        String title,
        String subtitle,
        Long totalSources,
        Long totalMembers,
        String status,
        String link,
        LocalDateTime occurredAt
) {
}
