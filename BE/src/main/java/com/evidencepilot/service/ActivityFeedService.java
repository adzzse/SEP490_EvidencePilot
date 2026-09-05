package com.evidencepilot.service;

import com.evidencepilot.dto.response.ActivityFeedResponse;

import java.util.UUID;

public interface ActivityFeedService {
    ActivityFeedResponse getMyActivity(UUID userId, int limit);
}
