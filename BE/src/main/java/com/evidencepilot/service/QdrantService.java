package com.evidencepilot.service;

import com.evidencepilot.dto.ExtractionResultPayload;

import java.util.UUID;

public interface QdrantService {
    void upsertVectors(ExtractionResultPayload payload);

    void deleteVectors(UUID documentId);
}
