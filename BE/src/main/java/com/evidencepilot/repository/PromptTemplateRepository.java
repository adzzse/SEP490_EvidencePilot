package com.evidencepilot.repository;

import com.evidencepilot.model.PromptTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PromptTemplateRepository extends JpaRepository<PromptTemplate, UUID> {
    List<PromptTemplate> findByTemplateKeyOrderByCreatedAtDesc(String templateKey);

    List<PromptTemplate> findAllByOrderByTemplateKeyAscCreatedAtDesc();

    Optional<PromptTemplate> findByTemplateKeyAndActiveTrue(String templateKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from PromptTemplate t where t.templateKey = :key order by t.id")
    List<PromptTemplate> lockVersions(@Param("key") String key);
}
