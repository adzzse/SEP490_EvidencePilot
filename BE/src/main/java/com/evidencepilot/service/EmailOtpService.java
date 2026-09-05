package com.evidencepilot.service;

import com.evidencepilot.dto.response.EmailOtpRequestResponse;
import com.evidencepilot.dto.response.EmailOtpVerifyResponse;

import java.util.UUID;

public interface EmailOtpService {

    EmailOtpRequestResponse requestOtp(UUID userId, String email);

    EmailOtpVerifyResponse verifyOtp(UUID userId, String email, String code);

    /**
     * Validates and consumes a one-shot claim token previously issued by {@link #verifyOtp}.
     * Returns true if the claim is valid for the given (user, newEmail) pair, false otherwise.
     * On success the claim row is marked consumed; on failure nothing is mutated.
     */
    boolean consumeClaim(UUID userId, String newEmail, String rawClaimToken);
}
