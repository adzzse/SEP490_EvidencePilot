package com.evidencepilot.repository;

import com.evidencepilot.model.PromptTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PromptTemplateRepository extends JpaRepository<PromptTemplate, UUID> {
    List<PromptTemplate> findByTemplateKeyOrderByCreatedAtDesc(String templateKey);

    List<PromptTemplate> findAllByOrderByTemplateKeyAscCreatedAtDesc();

    Optional<PromptTemplate> findByTemplateKeyAndActiveTrue(String templateKey);
}
