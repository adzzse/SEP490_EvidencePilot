package com.evidencepilot.repository;

import com.evidencepilot.model.Session;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

public interface SessionRepository extends JpaRepository<Session, String> {

    @Transactional
    void deleteByExpiresAtBefore(LocalDateTime cutoff);
}
