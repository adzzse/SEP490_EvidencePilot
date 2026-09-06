package com.evidencepilot.service;

import java.util.UUID;

import com.evidencepilot.dto.response.AuthResponse;

public interface UserInvitationService {

    /**
     * Issues (or re-issues) a set-password invitation: fresh token, 24h
     * expiry, status VERIFYING_EMAIL, verification email sent.
     */
    void issueInvitation(UUID userId);

    /**
     * Consumes an invitation token, sets the user's own password, applies
     * optional first/last name, and mints a fresh JWT for auto-login.
     * Expiry is validated at request time — never trust the sweeper job.
     */
    AuthResponse acceptInvitation(String rawToken, String newPassword, String firstName, String lastName);

    /**
     * Returns {email, role, studentCode} for a valid (unexpired) invitation
     * token, or throws 400. Does not consume the token or mutate the user.
     */
    InvitationPreview previewInvitation(String rawToken);

    /**
     * Hygiene only: flips expired VERIFYING_EMAIL rows back to PENDING.
     * Security enforcement lives in {@link #acceptInvitation}.
     */
    int sweepExpiredInvitations();

    record InvitationPreview(String email, String role, String studentCode, String firstName, String lastName) {}
}
