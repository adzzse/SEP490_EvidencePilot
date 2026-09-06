package com.evidencepilot.dto.response;

import com.evidencepilot.model.enums.ProcessingStatus;
import java.util.List;
import java.util.UUID;

public record ProjectSourceMapResponse(
        ProjectNode project,
        List<GraphNode> nodes,
        List<GraphEdge> edges,
        List<String> limitations
) {
    public record ProjectNode(UUID id, String title) {}

    public record GraphNode(
            String id, String type, UUID documentId, String title, String originalFilename,
            String doi, String authors, Integer publicationYear,
            ProcessingStatus processingStatus, boolean fileAvailable
    ) {}

    public record GraphEdge(
            String sourceId, String targetId, String type, List<UUID> referenceIds
    ) {}
}
