package com.evidencepilot.repository;

import com.evidencepilot.model.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
