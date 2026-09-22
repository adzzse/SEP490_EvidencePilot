package com.evidencepilot.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "project_deletion_cleanup_tasks")
@Getter
@Setter
public class ProjectDeletionCleanupTask {

    public enum ResourceType {
        MINIO_OBJECT,
        MINIO_OBJECT_IF_HASH_UNUSED,
        QDRANT_DOCUMENT
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @Column(name = "project_id", columnDefinition = "BINARY(16)", nullable = false)
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID projectId;

    @Enumerated(EnumType.STRING)
    @Column(name = "resource_type", length = 32, nullable = false)
    private ResourceType resourceType;

    @Column(name = "resource_key", length = 512, nullable = false)
    private String resourceKey;

    @Column(name = "guard_key", length = 64)
    private String guardKey;

    @Column(nullable = false)
    private int attempts = 0;

    @Column(name = "next_attempt_at", nullable = false)
    private LocalDateTime nextAttemptAt;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
