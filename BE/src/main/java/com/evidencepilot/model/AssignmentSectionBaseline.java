package com.evidencepilot.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;

/**
 * Immutable first-handoff baseline: section content frozen the first time the
 * section is handed to Student work. Insert-if-absent keyed by
 * UNIQUE(project_id, section_id) — reassignment never creates a new row.
 */
@Entity
@Table(name = "assignment_section_baselines",
        uniqueConstraints = @UniqueConstraint(name = "uq_asb_project_section",
                columnNames = {"project_id", "section_id"}))
@Getter
@Setter
public class AssignmentSectionBaseline {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "section_id", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private PaperSection section;

    @Column(name = "content_tex", nullable = false, columnDefinition = "LONGTEXT")
    private String contentTex;

    @Column(name = "content_version")
    private Integer contentVersion;

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
