package com.evidencepilot.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;

import lombok.Getter;
import lombok.Setter;

/**
 * Extractor-owned frontmatter: everything before the first section heading.
 * Bibliographic authority (OpenAlex) stays on {@link Document}; this row holds
 * what the extraction bundle saw — title, author/affiliation/email lines and
 * keywords. Keywords live ONLY here, never as a section node.
 */
@Entity
@Table(name = "document_metadata")
@Getter
@Setter
public class DocumentMetadata {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id", columnDefinition = "BINARY(16)",
            referencedColumnName = "id", nullable = false, unique = true)
    private Document document;

    @Column(name = "title", length = 1000)
    private String title;

    /**
     * JSON array of {name, affiliations[], emails[]}. Shape enforced by
     * V30 CHECK + {@link com.evidencepilot.service.impl.BlockTreeIngestor} validation.
     */
    @Column(name = "authors_json", columnDefinition = "JSON", nullable = false)
    private String authorsJson = "[]";

    @Column(name = "keywords", length = 1000)
    private String keywords;

    @Column(name = "extraction_source", length = 50, nullable = false)
    private String extractionSource = "blocks";

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
