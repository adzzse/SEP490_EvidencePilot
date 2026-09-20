package com.evidencepilot.repository;

import com.evidencepilot.model.DocumentExtractionCandidate;
import com.evidencepilot.model.enums.ExtractionCandidateStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;

public interface DocumentExtractionCandidateRepository
        extends JpaRepository<DocumentExtractionCandidate, UUID> {

    @Query("""
            select case when count(c) > 0 then true else false end
            from DocumentExtractionCandidate c
            where c.document.id = :documentId
              and c.status in (
                com.evidencepilot.model.enums.ExtractionCandidateStatus.REQUESTED,
                com.evidencepilot.model.enums.ExtractionCandidateStatus.PROCESSING,
                com.evidencepilot.model.enums.ExtractionCandidateStatus.READY
              )
            """)
    boolean existsActiveForDocument(@Param("documentId") UUID documentId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select c from DocumentExtractionCandidate c
            where c.document.id = :documentId
              and c.status in :statuses
            order by c.createdAt desc
            """)
    Optional<DocumentExtractionCandidate> findLatestForDocumentWithLock(
            @Param("documentId") UUID documentId,
            @Param("statuses") java.util.Collection<ExtractionCandidateStatus> statuses);
}
