package com.evidencepilot.service;

import com.evidencepilot.dto.response.EmailChangeResponse;
import java.util.UUID;

public interface EmailVerificationService {

    EmailChangeResponse requestEmailChange(UUID userId, String newEmail);

    void confirmEmailChange(String rawToken);

    void cancelEmailChange(UUID userId);
}
