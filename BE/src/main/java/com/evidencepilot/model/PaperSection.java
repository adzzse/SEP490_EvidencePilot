package com.evidencepilot.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;

import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "paper_sections")
@Getter
@Setter
public class PaperSection {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id", columnDefinition = "BINARY(16)", referencedColumnName = "id", nullable = false)
    private Document document;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_user_id", columnDefinition = "BINARY(16)", referencedColumnName = "id")
    private User assignedUser;

    @Column(name = "section_order", nullable = false)
    private Integer sectionOrder;

    @Column(name = "section_title", nullable = false)
    private String sectionTitle;

    @Column(name = "content_tex", nullable = false, columnDefinition = "LONGTEXT")
    private String contentTex;

    @Column(name = "previous_content_tex", columnDefinition = "LONGTEXT")
    private String previousContentTex;

    @Column(name = "version")
    private Integer version = 1;

    @Version
    @Column(name = "opt_version")
    private Long optVersion;

    @Column(name = "content_md_cache", columnDefinition = "LONGTEXT")
    private String contentMdCache;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "handoff_confirmed_by", columnDefinition = "BINARY(16)", referencedColumnName = "id")
    private User handoffConfirmedBy;

    @Column(name = "handoff_confirmed_at")
    private LocalDateTime handoffConfirmedAt;

    @Column(name = "handoff_content_version")
    private Integer handoffContentVersion;

    @Column(name = "handoff_input_fingerprint", length = 64)
    private String handoffInputFingerprint;

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        PaperSection that = (PaperSection) o;
        return id.equals(that.id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }
}
