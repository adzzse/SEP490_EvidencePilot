package com.evidencepilot.dto.response;

import com.evidencepilot.model.Collection;

import java.time.LocalDateTime;
import java.util.UUID;

public record CollectionResponse(
    UUID id,
    String name,
    String description,
    UUID categoryId,
    String categoryName,
    LocalDateTime createdAt,
    long totalSources
) {
    public static CollectionResponse from(Collection collection) {
        return from(collection, 0L);
    }

    public static CollectionResponse from(Collection collection, long totalSources) {
        return new CollectionResponse(
                collection.getId(),
                collection.getTitle(),
                collection.getDescription(),
                collection.getCategory() != null ? collection.getCategory().getId() : null,
                collection.getCategory() != null ? collection.getCategory().getName() : null,
                collection.getCreatedAt(),
                totalSources);
    }
}
