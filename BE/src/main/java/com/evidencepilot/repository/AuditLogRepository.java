package com.evidencepilot.repository;

import com.evidencepilot.model.AuditLog;
import com.evidencepilot.model.enums.AuditSeverity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {
    @Query("""
            select a from AuditLog a where
                (upper(a.entityType) = 'PROJECT' and a.entityId = :projectId)
                or (upper(a.entityType) = 'DOCUMENT' and exists
                    (select d.id from Document d where d.id = a.entityId and d.project.id = :projectId))
                or (a.entityType = 'PaperSection' and exists
                    (select s.id from PaperSection s where s.id = a.entityId and s.document.project.id = :projectId))
            """)
    org.springframework.data.domain.Slice<AuditLog> findForExport(@Param("projectId") UUID projectId, Pageable pageable);

    Page<AuditLog> findAllByOrderByOccurredAtDesc(Pageable pageable);
    Page<AuditLog> findByActorIdOrderByOccurredAtDesc(UUID actorId, Pageable pageable);
    Page<AuditLog> findByEntityTypeAndEntityIdOrderByOccurredAtDesc(String entityType, UUID entityId, Pageable pageable);
    Page<AuditLog> findByActorIdAndEntityTypeAndEntityIdOrderByOccurredAtDesc(
            UUID actorId, String entityType, UUID entityId, Pageable pageable);
    Page<AuditLog> findByActionOrderByOccurredAtDesc(String action, Pageable pageable);
    Page<AuditLog> findBySeverityOrderByOccurredAtDesc(AuditSeverity severity, Pageable pageable);
    Page<AuditLog> findByActorIdAndSeverityOrderByOccurredAtDesc(UUID actorId, AuditSeverity severity, Pageable pageable);
    Page<AuditLog> findByActorIdAndActionOrderByOccurredAtDesc(UUID actorId, String action, Pageable pageable);
    Page<AuditLog> findByActionAndSeverityOrderByOccurredAtDesc(String action, AuditSeverity severity, Pageable pageable);
    Page<AuditLog> findByActorIdAndActionAndSeverityOrderByOccurredAtDesc(
            UUID actorId, String action, AuditSeverity severity, Pageable pageable);

    /**
     * Phase C: upload-audit gap detection. Active documents with no
     * DOCUMENT_UPLOADED row (e.g. best-effort audit failed at upload time).
     * Consumed by UploadAuditReconciler; no auto-backfill — backfilled rows
     * would falsify occurredAt, so orphans surface for ops review instead.
     */
    @Query("""
            select d.id from Document d where d.active = true and not exists
                (select a.id from AuditLog a where a.action = 'DOCUMENT_UPLOADED'
                    and a.entityType = 'DOCUMENT' and a.entityId = d.id)
            """)
    List<UUID> findActiveDocumentIdsMissingUploadAudit();

// Phase 1.5: DB-level daily aggregation — preserves wordDelta→wordsAdded/Removed fallback for legacy rows.
// Matches both PROJECT rows and the live PaperSection writer (PaperProcessingServiceImpl
// records SECTION_CONTENT_UPDATED per section so the activity feed can resolve it);
// the section arm is scoped to this project via paper_sections → documents.
    @Query(value = """
            SELECT
              actor_id,
              CASE :resolution
                WHEN 'day' THEN DATE(occurred_at)
                WHEN 'week' THEN DATE_SUB(DATE(occurred_at), INTERVAL WEEKDAY(occurred_at) DAY)
                WHEN 'month' THEN DATE_FORMAT(occurred_at, '%Y-%m-01')
              END as d,
              COUNT(*) as cnt,
              COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordDelta')) AS SIGNED)),0) as sum_delta,
              COALESCE(SUM(CASE WHEN JSON_EXTRACT(new_value, '$.wordsAdded') IS NOT NULL THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordsAdded')) AS SIGNED) ELSE GREATEST(CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordDelta')) AS SIGNED),0) END),0) as sum_added,
              COALESCE(SUM(CASE WHEN JSON_EXTRACT(new_value, '$.wordsRemoved') IS NOT NULL THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordsRemoved')) AS SIGNED) ELSE GREATEST(-CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordDelta')) AS SIGNED),0) END),0) as sum_removed,
              MAX(occurred_at) as max_at,
              GROUP_CONCAT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.sectionTitle')) SEPARATOR '||') as titles
            FROM audit_logs
            WHERE action = 'SECTION_CONTENT_UPDATED'
              AND ((entity_type = 'PROJECT' AND entity_id = :projectId)
                OR (entity_type = 'PaperSection' AND entity_id IN (
                  SELECT ps.id FROM paper_sections ps
                  JOIN documents d ON d.id = ps.document_id
                  WHERE d.project_id = :projectId)))
              AND occurred_at >= :fromInclusive
              AND occurred_at < :toExclusive
            GROUP BY actor_id, d
            ORDER BY actor_id, d
            """, nativeQuery = true)
    List<Object[]> aggregateDailyWithin(
            @Param("projectId") byte[] projectId,
            @Param("fromInclusive") LocalDateTime fromInclusive,
            @Param("toExclusive") LocalDateTime toExclusive,
            @Param("resolution") String resolution);

    @Query(value = """
            SELECT
              actor_id,
              DATE(occurred_at) as d,
              COUNT(*) as cnt,
              COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordDelta')) AS SIGNED)),0) as sum_delta,
              COALESCE(SUM(CASE WHEN JSON_EXTRACT(new_value, '$.wordsAdded') IS NOT NULL THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordsAdded')) AS SIGNED) ELSE GREATEST(CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordDelta')) AS SIGNED),0) END),0) as sum_added,
              COALESCE(SUM(CASE WHEN JSON_EXTRACT(new_value, '$.wordsRemoved') IS NOT NULL THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordsRemoved')) AS SIGNED) ELSE GREATEST(-CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.wordDelta')) AS SIGNED),0) END),0) as sum_removed,
              MAX(occurred_at) as max_at,
              GROUP_CONCAT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.sectionTitle')) SEPARATOR '||') as titles
            FROM audit_logs
            WHERE action = 'SECTION_CONTENT_UPDATED'
              AND ((entity_type = 'PROJECT' AND entity_id = :projectId)
                OR (entity_type = 'PaperSection' AND entity_id IN (
                  SELECT ps.id FROM paper_sections ps
                  JOIN documents d ON d.id = ps.document_id
                  WHERE d.project_id = :projectId)))
            GROUP BY actor_id, DATE(occurred_at)
            ORDER BY actor_id, d
            """, nativeQuery = true)
    List<Object[]> aggregateDailyAll(
            @Param("projectId") byte[] projectId);
}
