package com.evidencepilot.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;

import lombok.Getter;
import lombok.Setter;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.model.enums.AccountStatus;

@Entity
@Table(name = "users")
@Getter
@Setter
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @Column(nullable = false)
    private String email;

    @Column(name = "pending_email")
    private String pendingEmail;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    private UserRole role;

    @Enumerated(EnumType.STRING)
    @Column(name = "account_status", nullable = false)
    private AccountStatus accountStatus = AccountStatus.ACTIVE;

    @Column(name = "student_code", length = 50)
    private String studentCode;

    /**
     * MinIO object key only (e.g. avatars/{userId}.jpg) — never a URL.
     * The full URL is constructed at read time (see UserAvatarService).
     */
    @Column(name = "avatar_key", length = 512)
    private String avatarKey;

    @Column(name = "password_change_notice_pending", nullable = false)
    private boolean passwordChangeNoticePending;

    @Column(name = "password_reset_token_hash", unique = true)
    private String passwordResetTokenHash;

    @Column(name = "password_reset_token_expires_at")
    private LocalDateTime passwordResetTokenExpiresAt;

    @Column(name = "password_reset_requested_at")
    private LocalDateTime passwordResetRequestedAt;

    @Column(name = "email_verification_token_hash", unique = true)
    private String emailVerificationTokenHash;

    @Column(name = "email_verification_token_expires_at")
    private LocalDateTime emailVerificationTokenExpiresAt;

    @Column(name = "email_verification_requested_at")
    private LocalDateTime emailVerificationRequestedAt;

    /**
     * Invitation token for the admin-created verify-email flow (V22).
     * Distinct from the V18 change-email hash columns.
     */
    @Column(name = "email_verification_token", unique = true)
    private String emailVerificationToken;

    @Column(name = "email_verification_expires_at")
    private LocalDateTime emailVerificationExpiresAt;

    /**
     * Deliberate, un-hashable sentinel for accounts that must set their own
     * password via verification link. NOT NULL-safe alternative to NULL that
     * can never verify against any encoder — explicit in dumps and audits.
     */
    public static final String DISABLED_PASSWORD_SENTINEL = "DISABLED_PENDING_VERIFICATION";

    @Column(name = "token_version", nullable = false)
    private int tokenVersion;

    private String firstName;
    private String lastName;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        User user = (User) o;
        return id.equals(user.id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }
}
