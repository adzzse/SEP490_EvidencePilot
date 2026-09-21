package com.evidencepilot.repository;

import com.evidencepilot.model.CitationReviewRound;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CitationReviewRoundRepository extends JpaRepository<CitationReviewRound, UUID> {
    Optional<CitationReviewRound> findFirstBySectionIdOrderByCreatedAtDesc(UUID sectionId);

    List<CitationReviewRound> findBySectionIdOrderByCreatedAtDesc(UUID sectionId);

    boolean existsBySectionId(UUID sectionId);

    List<CitationReviewRound> findByProjectIdOrderByCreatedAtDesc(UUID projectId);
}
