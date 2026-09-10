package com.evidencepilot.repository;

import com.evidencepilot.model.DocumentMetadata;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DocumentMetadataRepository extends JpaRepository<DocumentMetadata, UUID> {
    Optional<DocumentMetadata> findByDocumentId(UUID documentId);
}
