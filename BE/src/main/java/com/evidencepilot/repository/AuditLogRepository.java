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

    // Phase 1.5: DB-level daily aggregation — avoids Java loop over every audit row
    @Query(value = """
            SELECT
              actor_id,
              DATE(occurred_at) as d,
              COUNT(*) as cnt,
              COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordDelta')) AS SIGNED)),0) as sum_delta,
              COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordsAdded')) AS SIGNED)),0) as sum_added,
              COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordsRemoved')) AS SIGNED)),0) as sum_removed,
              MAX(occurred_at) as max_at,
              GROUP_CONCAT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.sectionTitle')) SEPARATOR '||') as titles
            FROM audit_logs
            WHERE action = 'SECTION_CONTENT_UPDATED'
              AND entity_type = 'PROJECT'
              AND entity_id = :projectId
              AND occurred_at >= :fromInclusive
              AND occurred_at < :toExclusive
            GROUP BY actor_id, DATE(occurred_at)
            ORDER BY actor_id, d
            """, nativeQuery = true)
    List<Object[]> aggregateDailyWithin(
            @Param("projectId") byte[] projectId,
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive);

    @Query(value = """
            SELECT
              actor_id,
              DATE(occurred_at) as d,
              COUNT(*) as cnt,
              COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordDelta')) AS SIGNED)),0) as sum_delta,
              COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordsAdded')) AS SIGNED)),0) as sum_added,
              COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordsRemoved')) AS SIGNED)),0) as sum_removed,
              MAX(occurred_at) as max_at,
              GROUP_CONCAT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.sectionTitle')) SEPARATOR '||') as titles
            FROM audit_logs
            WHERE action = 'SECTION_CONTENT_UPDATED'
              AND entity_type = 'PROJECT'
              AND entity_id = :projectId
            GROUP BY actor_id, DATE(occurred_at)
            ORDER BY actor_id, d
            """, nativeQuery = true)
    List<Object[]> aggregateDailyAll(
            @Param("projectId") byte[] projectId);
}
