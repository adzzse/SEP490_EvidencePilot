package com.evidencepilot.repository;

import com.evidencepilot.model.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {
    Page<AuditLog> findAllByOrderByOccurredAtDesc(Pageable pageable);
    Page<AuditLog> findByActorIdOrderByOccurredAtDesc(UUID actorId, Pageable pageable);
    Page<AuditLog> findByEntityTypeAndEntityIdOrderByOccurredAtDesc(String entityType, UUID entityId, Pageable pageable);
    Page<AuditLog> findByActorIdAndEntityTypeAndEntityIdOrderByOccurredAtDesc(
            UUID actorId, String entityType, UUID entityId, Pageable pageable);
    Page<AuditLog> findByActionOrderByOccurredAtDesc(String action, Pageable pageable);
    List<AuditLog> findByActionAndEntityTypeAndEntityIdOrderByOccurredAtAsc(
            String action, String entityType, UUID entityId);

    @Query("""
            SELECT a FROM AuditLog a
            WHERE a.action = 'SECTION_CONTENT_UPDATED'
              AND a.entityType = 'PROJECT'
              AND a.entityId = :projectId
              AND a.occurredAt >= :fromInclusive
              AND a.occurredAt < :toExclusive
            ORDER BY a.occurredAt ASC
            """)
    List<AuditLog> findProjectEditsWithin(
            @Param("projectId") UUID projectId,
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);
}
