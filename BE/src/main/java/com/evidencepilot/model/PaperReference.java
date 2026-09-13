package com.evidencepilot.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;

import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "paper_references",
       uniqueConstraints = @UniqueConstraint(name = "uk_paper_reference", columnNames = {"paper_id", "source_id"}),
       indexes = @Index(name = "ix_paper_reference_order", columnList = "paper_id, added_at"))
@Getter
@Setter
public class PaperReference {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "paper_id", columnDefinition = "BINARY(16)", nullable = false)
    private Document paper;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_id", columnDefinition = "BINARY(16)", nullable = false)
    private Document source;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "added_by", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    private User addedBy;

    @Column(name = "added_at", nullable = false)
    private LocalDateTime addedAt;
}
