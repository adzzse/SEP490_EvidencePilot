package com.evidencepilot.repository;

import com.evidencepilot.model.FeedbackReply;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FeedbackReplyRepository extends JpaRepository<FeedbackReply, UUID> {

    List<FeedbackReply> findByFeedbackIdInOrderByCreatedAtAsc(Collection<UUID> feedbackIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from FeedbackReply r where r.feedback.id in :feedbackIds order by r.createdAt asc")
    List<FeedbackReply> findByFeedbackIdInForUpdate(@Param("feedbackIds") Collection<UUID> feedbackIds);

    Optional<FeedbackReply> findByFeedbackIdAndIdempotencyKey(UUID feedbackId, UUID idempotencyKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from FeedbackReply r where r.id = :replyId and r.feedback.id = :feedbackId")
    Optional<FeedbackReply> findByIdAndFeedbackIdForUpdate(
            @Param("feedbackId") UUID feedbackId, @Param("replyId") UUID replyId);
}
