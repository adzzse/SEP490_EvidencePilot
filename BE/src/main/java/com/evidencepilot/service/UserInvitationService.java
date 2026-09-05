package com.evidencepilot.service;

import java.util.UUID;

public interface UserInvitationService {

    /**
     * Issues (or re-issues) a set-password invitation: fresh token, 24h
     * expiry, status VERIFYING_EMAIL, verification email sent.
     */
    void issueInvitation(UUID userId);

    /**
     * Consumes an invitation token and sets the user's own password.
     * Expiry is validated at request time — never trust the sweeper job.
     */
    void acceptInvitation(String rawToken, String newPassword);

    /**
     * Hygiene only: flips expired VERIFYING_EMAIL rows back to PENDING.
     * Security enforcement lives in {@link #acceptInvitation}.
     */
    int sweepExpiredInvitations();
}
