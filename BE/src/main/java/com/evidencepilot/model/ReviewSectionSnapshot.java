package com.evidencepilot.model;

import com.evidencepilot.model.enums.SnapshotType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;

@Entity
@Table(name = "review_section_snapshots",
        uniqueConstraints = @UniqueConstraint(name = "uq_rss_request_section_type",
                columnNames = {"request_id", "section_id", "snapshot_type"}))
@Getter
@Setter
public class ReviewSectionSnapshot {

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

    @Column(name = "content_tex", nullable = false, columnDefinition = "LONGTEXT")
    private String contentTex;

    @Column(name = "content_version")
    private Integer contentVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "snapshot_type", nullable = false, length = 10)
    private SnapshotType snapshotType;

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
