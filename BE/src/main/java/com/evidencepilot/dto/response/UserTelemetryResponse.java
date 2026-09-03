package com.evidencepilot.dto.response;

import com.evidencepilot.model.enums.UserRole;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record UserTelemetryResponse(
        UserRole role,
        Map<String, Object> metrics,
        List<MilestoneItem> recentMilestones
) {
    public record MilestoneItem(
            String id,
            String type,
            String title,
            String description,
            LocalDateTime occurredAt
    ) {
    }
}
