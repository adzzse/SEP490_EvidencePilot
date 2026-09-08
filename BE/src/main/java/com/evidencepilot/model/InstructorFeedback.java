package com.evidencepilot.model;

import com.evidencepilot.model.enums.FeedbackThreadState;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;

@Entity
@Table(name = "instructor_feedbacks")
@Getter
@Setter
public class InstructorFeedback {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "request_id", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private FeedbackRequest request;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "section_id", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private PaperSection section;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "instructor_id", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User instructor;

    @Column(name = "line_reference")
    private String lineReference;

    @Column(name = "section_version")
    private Integer sectionVersion;

    @Column(name = "anchor_json", columnDefinition = "LONGTEXT")
    private String anchorJson;

    @Version
    @Column(name = "opt_version", nullable = false)
    private Long optVersion = 0L;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by", columnDefinition = "BINARY(16)", referencedColumnName = "id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User updatedBy;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "thread_state", nullable = false, length = 10)
    private FeedbackThreadState threadState = FeedbackThreadState.OPEN;

    @Column(name = "state_changed_at")
    private LocalDateTime stateChangedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "state_changed_by", columnDefinition = "BINARY(16)", referencedColumnName = "id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User stateChangedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "pending_state", length = 10)
    private FeedbackThreadState pendingState;

    @Column(name = "pending_state_opt_version")
    private Long pendingStateOptVersion;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        InstructorFeedback that = (InstructorFeedback) o;
        return id.equals(that.id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }
}
