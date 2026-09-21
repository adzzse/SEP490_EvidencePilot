package com.evidencepilot.repository;

import com.evidencepilot.model.ReviewSectionSnapshot;
import com.evidencepilot.model.enums.SnapshotType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ReviewSectionSnapshotRepository extends JpaRepository<ReviewSectionSnapshot, UUID> {

    List<ReviewSectionSnapshot> findByRequestId(UUID requestId);

    List<ReviewSectionSnapshot> findByRequestIdAndSectionId(UUID requestId, UUID sectionId);

    boolean existsBySectionId(UUID sectionId);

    boolean existsByRequestIdAndSectionIdAndSnapshotType(UUID requestId, UUID sectionId, SnapshotType snapshotType);
}
