package com.evidencepilot.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ai_evaluation_jobs")
@Getter
@Setter
public class AiEvaluationJob {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_PROCESSING = "PROCESSING";
    public static final String STATUS_SUCCESS = "SUCCESS";
    public static final String STATUS_FAILED = "FAILED";

    public static final String KIND_SECTION_CITATION_REVIEW = "SECTION_CITATION_REVIEW";
    public static final String KIND_SECTION_SUGGESTION = "SECTION_SUGGESTION";
    public static final String KIND_SECTION_SELF_CHECK = "SECTION_SELF_CHECK";
    public static final String KIND_SOURCE_MATCHES = "SOURCE_MATCHES";
    public static final String KIND_TRACE_RECHECK = "TRACE_RECHECK";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @Column(name = "project_id", columnDefinition = "BINARY(16)", nullable = false)
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID projectId;

    @Column(name = "kind", nullable = false, length = 50)
    private String kind;

    @Column(name = "payload_json", columnDefinition = "LONGTEXT", nullable = false)
    private String payloadJson;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "last_progress_at")
    private LocalDateTime lastProgressAt;

    @Column(name = "progress_current", nullable = false)
    private int progressCurrent;

    @Column(name = "progress_total", nullable = false)
    private int progressTotal;

    @Column(name = "result_json", columnDefinition = "LONGTEXT")
    private String resultJson;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;
}
