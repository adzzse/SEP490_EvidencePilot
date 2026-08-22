package com.evidencepilot.repository;

import com.evidencepilot.model.ExportJob;
import com.evidencepilot.model.enums.ExportStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface ExportJobRepository extends JpaRepository<ExportJob, UUID> {
    List<ExportJob> findByProjectIdAndUserIdOrderByCreatedAtDesc(UUID projectId, UUID userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE ExportJob job
            SET job.status = :pending,
                job.errorMessage = null,
                job.downloadUrl = null,
                job.updatedAt = :updatedAt
            WHERE job.id = :jobId AND job.status = :failed
            """)
    int retryFailed(
            @Param("jobId") UUID jobId,
            @Param("failed") ExportStatus failed,
            @Param("pending") ExportStatus pending,
            @Param("updatedAt") LocalDateTime updatedAt);
}
