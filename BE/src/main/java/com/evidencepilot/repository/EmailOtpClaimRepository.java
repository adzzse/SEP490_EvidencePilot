package com.evidencepilot.repository;

import com.evidencepilot.model.EmailOtpClaim;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EmailOtpClaimRepository extends JpaRepository<EmailOtpClaim, String> {
}
