package com.evidencepilot.service;

import com.evidencepilot.dto.request.UserProfileUpdateRequest;
import com.evidencepilot.dto.response.UserResponse;
import com.evidencepilot.model.enums.UserRole;
import java.util.List;
import java.util.UUID;

public interface UserService {
    UserResponse findUserById(UUID id);

    /**
     * Updates the current user's profile. When {@code request.getEmail()} differs
     * from the current email, {@code emailClaimToken} must be a valid unconsumed
     * one-shot claim token issued by {@code /api/users/email/otp/verify}.
     * Pass {@code null} or blank for names-only updates.
     */
    UserResponse updateUserProfile(UUID userId, UserProfileUpdateRequest request, String emailClaimToken);

    List<UserResponse> findUsersByRole(UserRole role);
    List<UserResponse> searchUsersByRole(UserRole role, String q);
}
