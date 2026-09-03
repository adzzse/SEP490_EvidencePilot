package com.evidencepilot.service;

import com.evidencepilot.dto.response.UserTelemetryResponse;
import java.util.UUID;

public interface UserTelemetryService {

    UserTelemetryResponse getMyTelemetry(UUID userId);
}
