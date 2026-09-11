package com.evidencepilot.repository;

import com.evidencepilot.model.AiGenerationConfig;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface AiGenerationConfigRepository extends JpaRepository<AiGenerationConfig, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from AiGenerationConfig c where c.id = 1")
    Optional<AiGenerationConfig> lockCurrent();
}
