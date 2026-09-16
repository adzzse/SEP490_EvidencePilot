package com.evidencepilot.dto.response;

import java.time.LocalDateTime;
import java.util.UUID;

public record ProjectMediaResponse(
    UUID id,
    UUID projectId,
    UUID uploadedBy,
    String storageKey,
    String texFilename,
    String mimeType,
    Long fileSizeBytes,
    LocalDateTime uploadedAt
) {}
