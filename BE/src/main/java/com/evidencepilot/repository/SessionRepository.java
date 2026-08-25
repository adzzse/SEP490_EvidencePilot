package com.evidencepilot.repository;

import com.evidencepilot.model.Session;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

public interface SessionRepository extends JpaRepository<Session, String> {

    @Transactional
    void deleteByExpiresAtBefore(LocalDateTime cutoff);

    @Modifying
    @Query("delete from Session session where session.jti = :jti")
    int consume(@Param("jti") String jti);
}
