package com.evidencepilot.dto.response;

import com.evidencepilot.model.enums.UserRole;

import java.util.List;

public record ActivityFeedResponse(
        UserRole role,
        List<ActivityFeedItem> items
) {
}
