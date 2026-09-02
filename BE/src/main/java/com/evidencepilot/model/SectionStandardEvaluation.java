package com.evidencepilot.model;

import com.evidencepilot.model.converter.StringListJsonConverter;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "section_standard_evaluations", indexes = {
        @Index(name = "idx_std_eval_section", columnList = "section_id"),
        @Index(name = "idx_std_eval_doc", columnList = "document_id")
})
@Getter
@Setter
public class SectionStandardEvaluation {
    public static final String STATUS_CONFIGURED = "CONFIGURED";
    public static final String STATUS_PASSED = "PASSED";
    public static final String STATUS_FAILED = "FAILED";
    public static final String STATUS_SYSTEM_ERROR = "SYSTEM_ERROR";
    public static final String STATUS_STALE = "STALE";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @Column(name = "section_id", columnDefinition = "BINARY(16)", nullable = false)
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID sectionId;

    @Column(name = "document_id", columnDefinition = "BINARY(16)", nullable = false)
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID documentId;

    @Column(name = "project_id", columnDefinition = "BINARY(16)", nullable = false)
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID projectId;

    @Column(name = "input_fingerprint", nullable = false, length = 64)
    private String inputFingerprint;

    @Column(name = "pass_threshold", nullable = false)
    private Integer passThreshold;

    @Column(name = "requirements_json", columnDefinition = "LONGTEXT")
    @Convert(converter = StringListJsonConverter.class)
    private List<String> requirements;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "score_percent")
    private Integer scorePercent;

    @Column(name = "result_json", columnDefinition = "LONGTEXT")
    private String resultJson;

    @Column(name = "raw_output", columnDefinition = "LONGTEXT")
    private String rawOutput;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
