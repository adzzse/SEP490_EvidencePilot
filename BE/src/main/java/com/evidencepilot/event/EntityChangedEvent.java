package com.evidencepilot.event;

import java.util.UUID;

public record EntityChangedEvent(
        String entity,
        UUID id,
        String action,
        UUID projectId) {
}
