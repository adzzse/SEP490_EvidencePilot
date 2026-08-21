package com.evidencepilot.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "citation_review_rounds")
@Getter
@Setter
public class CitationReviewRound {

    public static final String LINK_MODE_VERBATIM_CONTINUATION = "VERBATIM_CONTINUATION";
    public static final String LINK_MODE_REVISION_CHAIN = "REVISION_CHAIN";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "section_id", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    private PaperSection section;

    @Column(name = "section_version", nullable = false)
    private Integer sectionVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requested_by", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    private User requestedBy;

    @Column(name = "content_fingerprint", nullable = false, length = 64)
    private String reviewInputFingerprint;

    @Column(name = "section_content_fingerprint", length = 64)
    private String sectionContentFingerprint;

    @Column(name = "style", nullable = false)
    private String style;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "generation_meta")
    private String generationMeta;

    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;

    @Column(name = "complete", nullable = false)
    private boolean complete = true;

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
