package com.evidencepilot.repository;

import com.evidencepilot.model.FeedbackReply;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FeedbackReplyRepository extends JpaRepository<FeedbackReply, UUID> {

    List<FeedbackReply> findByFeedbackIdOrderByCreatedAtAsc(UUID feedbackId);

    Optional<FeedbackReply> findByFeedbackIdAndAuthorIdAndIdempotencyKey(
            UUID feedbackId, UUID authorId, UUID idempotencyKey);
}
