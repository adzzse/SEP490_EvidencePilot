package com.evidencepilot.repository;

import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;

@Repository
public interface FeedbackRequestRepository extends JpaRepository<FeedbackRequest, UUID> {

    List<FeedbackRequest> findByProjectIdOrderByRequestedAtDesc(UUID projectId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from FeedbackRequest r where r.id = :id")
    Optional<FeedbackRequest> findByIdForUpdate(@Param("id") UUID id);

    List<FeedbackRequest> findByStudentIdOrderByRequestedAtDesc(UUID studentId);

    @Query("""
            select r from FeedbackRequest r where exists (
                select m.id from ProjectMember m where m.project = r.project and m.user.id = :userId
                    and m.user.role = com.evidencepilot.model.enums.UserRole.STUDENT
                    and m.user.accountStatus = com.evidencepilot.model.enums.AccountStatus.ACTIVE
                    and m.role in (com.evidencepilot.model.enums.ProjectRole.LEADER,
                        com.evidencepilot.model.enums.ProjectRole.MEMBER)
            ) order by r.requestedAt desc
            """)
    List<FeedbackRequest> findVisibleToStudent(@Param("userId") UUID userId);

    List<FeedbackRequest> findByInstructorIdOrderByRequestedAtDesc(UUID instructorId);

    List<FeedbackRequest> findByStatus(FeedbackStatus status);

    long countByInstructorIdAndStatus(UUID instructorId, FeedbackStatus status);

    boolean existsByProjectIdAndInstructorId(UUID projectId, UUID instructorId);

    boolean existsByProjectIdAndStatus(UUID projectId, FeedbackStatus status);
}
