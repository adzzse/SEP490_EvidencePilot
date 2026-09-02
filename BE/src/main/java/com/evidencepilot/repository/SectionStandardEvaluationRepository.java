package com.evidencepilot.repository;

import com.evidencepilot.model.SectionStandardEvaluation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SectionStandardEvaluationRepository extends JpaRepository<SectionStandardEvaluation, UUID> {
    Optional<SectionStandardEvaluation> findTopBySectionIdOrderByUpdatedAtDesc(UUID sectionId);
    List<SectionStandardEvaluation> findByDocumentId(UUID documentId);
    List<SectionStandardEvaluation> findByProjectId(UUID projectId);
    List<SectionStandardEvaluation> findBySectionIdIn(List<UUID> sectionIds);
}
