package com.evidencepilot.dto.response;

import java.util.List;
import java.util.UUID;

public record ProjectSourceUnshareResponse(
        List<UUID> removedSourceIds,
        List<BlockedSource> blocked) {

    public boolean hasBlockedSources() {
        return blocked != null && !blocked.isEmpty();
    }

    public record BlockedSource(UUID sourceId, String reason, int dependencyCount) {
    }
}
