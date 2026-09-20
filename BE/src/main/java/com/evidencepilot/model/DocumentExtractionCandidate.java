package com.evidencepilot.model;

import com.evidencepilot.model.enums.ExtractionCandidateStatus;
import com.evidencepilot.model.enums.ProcessingStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "document_extraction_candidates")
@Getter
@Setter
public class DocumentExtractionCandidate {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id", columnDefinition = "BINARY(16)", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Document document;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ExtractionCandidateStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_processing_status", nullable = false, length = 50)
    private ProcessingStatus previousProcessingStatus;

    @Column(name = "previous_chunk_count")
    private Integer previousChunkCount;

    @Column(name = "previous_processed_at")
    private LocalDateTime previousProcessedAt;

    @Column(name = "previous_processing_error", columnDefinition = "TEXT")
    private String previousProcessingError;

    @Column(name = "source_file_url", nullable = false, length = 500)
    private String sourceFileUrl;

    @Column(name = "source_file_hash_sha256", length = 64)
    private String sourceFileHashSha256;

    @Column(name = "extraction_method", length = 50)
    private String extractionMethod;

    @Column(name = "extracted_markdown", columnDefinition = "LONGTEXT")
    private String extractedMarkdown;

    @Column(name = "blocks_json", columnDefinition = "LONGTEXT")
    private String blocksJson;

    @Column(name = "chunks_json", columnDefinition = "LONGTEXT")
    private String chunksJson;

    @Column(name = "bundle_key", length = 500)
    private String bundleKey;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "prepared_at")
    private LocalDateTime preparedAt;

    @Column(name = "failed_at")
    private LocalDateTime failedAt;

    @Column(name = "failure_message", columnDefinition = "TEXT")
    private String failureMessage;
}
