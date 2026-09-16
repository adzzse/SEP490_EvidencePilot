package com.evidencepilot.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;

@Entity
@Table(name = "feedback_attachments")
@Getter
@Setter
public class FeedbackAttachment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "feedback_id", columnDefinition = "BINARY(16)", referencedColumnName = "id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private InstructorFeedback feedback;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reply_id", columnDefinition = "BINARY(16)", referencedColumnName = "id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private FeedbackReply reply;

    // Provenance/display only (texFilename). NEVER load-bearing: the thread
    // read path resolves exclusively the cloned storage_key, so library
    // deletion (ON DELETE SET NULL) degrades to a missing display name,
    // never a missing image.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "media_asset_id", columnDefinition = "BINARY(16)", referencedColumnName = "id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private ProjectMedia mediaAsset;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Project project;

    @Column(name = "storage_key", nullable = false, length = 500)
    private String storageKey;

    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;

    @Column(name = "file_size_bytes", nullable = false)
    private Long fileSizeBytes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploaded_by", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User uploadedBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        FeedbackAttachment that = (FeedbackAttachment) o;
        return id != null && id.equals(that.id);
    }

    @Override
    public int hashCode() {
        return id != null ? id.hashCode() : 0;
    }
}
