package com.evidencepilot.repository;

import com.evidencepilot.model.EmailOtpClaim;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface EmailOtpClaimRepository extends JpaRepository<EmailOtpClaim, String> {
    @Modifying
    @Query("delete from EmailOtpClaim c where c.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);
}
