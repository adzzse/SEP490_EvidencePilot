package com.evidencepilot.repository;

import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;

@Repository
public interface FeedbackRequestRepository extends JpaRepository<FeedbackRequest, UUID> {

    @Query("select r from FeedbackRequest r where r.project.id = :projectId order by r.requestedAt desc, r.id desc")
    List<FeedbackRequest> findByProjectIdOrderByRequestedAtDesc(@Param("projectId") UUID projectId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from FeedbackRequest r where r.id = :id")
    Optional<FeedbackRequest> findByIdForUpdate(@Param("id") UUID id);

    @Query("select r from FeedbackRequest r where r.student.id = :studentId order by r.requestedAt desc, r.id desc")
    List<FeedbackRequest> findByStudentIdOrderByRequestedAtDesc(@Param("studentId") UUID studentId);

    @Query("""
            select r from FeedbackRequest r where exists (
                select m.id from ProjectMember m where m.project = r.project and m.user.id = :userId
                    and m.user.role = com.evidencepilot.model.enums.UserRole.STUDENT
                    and m.user.accountStatus = com.evidencepilot.model.enums.AccountStatus.ACTIVE
                    and m.role in (com.evidencepilot.model.enums.ProjectRole.LEADER,
                        com.evidencepilot.model.enums.ProjectRole.MEMBER)
            ) order by r.requestedAt desc, r.id desc
            """)
    List<FeedbackRequest> findVisibleToStudent(@Param("userId") UUID userId);

    @Query("select r from FeedbackRequest r where r.instructor.id = :instructorId order by r.requestedAt desc, r.id desc")
    List<FeedbackRequest> findByInstructorIdOrderByRequestedAtDesc(@Param("instructorId") UUID instructorId);

    List<FeedbackRequest> findByStatus(FeedbackStatus status);

    long countByInstructorIdAndStatus(UUID instructorId, FeedbackStatus status);

    boolean existsByProjectIdAndInstructorId(UUID projectId, UUID instructorId);

    boolean existsByProjectIdAndStatus(UUID projectId, FeedbackStatus status);

    @EntityGraph(attributePaths = {"project", "student", "instructor"})
    @Query(value = """
            select r from FeedbackRequest r
            where (:instructorId is null or r.instructor.id = :instructorId)
              and (:projectId is null or r.project.id = :projectId)
              and (:status is null or r.status = :status)
              and (:fromTime is null or r.requestedAt >= :fromTime)
              and (:toTimeExclusive is null or r.requestedAt < :toTimeExclusive)
              and (:search is null or lower(r.project.title) like lower(concat('%', :search, '%')))
              and not exists (
                  select newer.id from FeedbackRequest newer
                  where newer.project.id = r.project.id
                    and (newer.requestedAt > r.requestedAt
                         or (newer.requestedAt = r.requestedAt and newer.id > r.id))
              )
            order by r.requestedAt desc, r.id desc
            """,
            countQuery = """
            select count(r) from FeedbackRequest r
            where r.instructor.id = :instructorId
              and (:projectId is null or r.project.id = :projectId)
              and (:status is null or r.status = :status)
              and (:fromTime is null or r.requestedAt >= :fromTime)
              and (:toTimeExclusive is null or r.requestedAt < :toTimeExclusive)
              and (:search is null or lower(r.project.title) like lower(concat('%', :search, '%')))
              and not exists (
                  select newer.id from FeedbackRequest newer
                  where newer.project.id = r.project.id
                    and (newer.requestedAt > r.requestedAt
                         or (newer.requestedAt = r.requestedAt and newer.id > r.id))
              )
            """)
    Page<FeedbackRequest> findCurrent(
            @Param("instructorId") UUID instructorId,
            @Param("projectId") UUID projectId,
            @Param("status") FeedbackStatus status,
            @Param("fromTime") LocalDateTime fromTime,
            @Param("toTimeExclusive") LocalDateTime toTimeExclusive,
            @Param("search") String search,
            Pageable pageable);
}
