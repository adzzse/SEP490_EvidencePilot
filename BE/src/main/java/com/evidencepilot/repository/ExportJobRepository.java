package com.evidencepilot.repository;

import com.evidencepilot.model.ExportJob;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ExportJobRepository extends JpaRepository<ExportJob, UUID> {
    List<ExportJob> findByProjectIdAndUserIdOrderByCreatedAtDesc(UUID projectId, UUID userId);
}
