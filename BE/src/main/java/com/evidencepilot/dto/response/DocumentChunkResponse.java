package com.evidencepilot.dto.response;

import com.evidencepilot.model.DocumentChunk;

import java.util.UUID;

public record DocumentChunkResponse(
    UUID id,
    UUID documentId,
    Integer chunkIndex,
    String text,
    boolean active
) {
    public static DocumentChunkResponse from(DocumentChunk chunk) {
        return new DocumentChunkResponse(
                chunk.getId(),
                chunk.getDocument() != null ? chunk.getDocument().getId() : null,
                chunk.getChunkIndex(),
                chunk.getText(),
                chunk.isActive());
    }
}
