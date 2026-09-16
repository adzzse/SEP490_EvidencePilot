package com.evidencepilot.model;

import com.evidencepilot.model.enums.ReplyAuthorRole;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;

@Entity
@Table(name = "feedback_replies")
@Getter
@Setter
public class FeedbackReply {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "feedback_id", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private InstructorFeedback feedback;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id", columnDefinition = "BINARY(16)", referencedColumnName = "id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User author;

    @Enumerated(EnumType.STRING)
    @Column(name = "author_role", nullable = false, length = 20)
    private ReplyAuthorRole authorRole = ReplyAuthorRole.UNKNOWN;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "published_request_id", columnDefinition = "BINARY(16)", referencedColumnName = "id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private FeedbackRequest publishedRequest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "request_id", columnDefinition = "BINARY(16)", referencedColumnName = "id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private FeedbackRequest request;

    @Column(name = "idempotency_key", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID idempotencyKey;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        FeedbackReply that = (FeedbackReply) o;
        return id != null && id.equals(that.id);
    }

    @Override
    public int hashCode() {
        return id != null ? id.hashCode() : 0;
    }
}
