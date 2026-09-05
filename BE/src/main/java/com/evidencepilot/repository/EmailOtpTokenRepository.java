package com.evidencepilot.repository;

import com.evidencepilot.model.EmailOtpToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EmailOtpTokenRepository extends JpaRepository<EmailOtpToken, UUID> {

    Optional<EmailOtpToken> findTopByUserIdAndEmailAndVerifiedAtIsNullOrderByCreatedAtDesc(UUID userId, String email);

    List<EmailOtpToken> findByUserIdAndVerifiedAtIsNull(UUID userId);

    @Modifying
    @Query("delete from EmailOtpToken t where t.user.id = :userId and t.verifiedAt is null")
    void deleteUnverifiedByUserId(@Param("userId") UUID userId);
}
