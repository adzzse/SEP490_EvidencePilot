package com.evidencepilot.model;

import com.evidencepilot.model.converter.StringListJsonConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "ai_generation_config")
@Getter
@Setter
public class AiGenerationConfig {
    @Id
    private Long id;

    @Version
    @Column(nullable = false)
    private long revision;

    @Column(length = 30)
    private String source;

    @Column(length = 100)
    private String provider;

    @Convert(converter = StringListJsonConverter.class)
    @Column(name = "model_ids_json", columnDefinition = "JSON")
    private List<String> modelIds;

    @Column(name = "catalog_fingerprint", length = 64)
    private String catalogFingerprint;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by")
    private User updatedBy;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
