package com.evidencepilot.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AuditService;

class UserInvitationServiceImplTest {

    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final JavaMailSender mail = mock(JavaMailSender.class);
    private final AuditService audit = mock(AuditService.class);
    private final UserInvitationServiceImpl service = new UserInvitationServiceImpl(
            users, passwords, mail, audit, "https://app.test/set-password", Duration.ofHours(24));

    private User user() {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setEmail("new@example.com");
        u.setRole(UserRole.STUDENT);
        u.setAccountStatus(AccountStatus.VERIFYING_EMAIL);
        u.setTokenVersion(1);
        return u;
    }

    @Test
    void issueInvitation_setsTokenExpiryStatusAndSendsMail() {
        User u = user();
        u.setAccountStatus(AccountStatus.PENDING);
        when(users.findById(u.getId())).thenReturn(Optional.of(u));

        service.issueInvitation(u.getId());

        assertThat(u.getEmailVerificationToken()).isNotBlank();
        assertThat(u.getEmailVerificationExpiresAt()).isAfter(LocalDateTime.now().plusHours(23));
        assertThat(u.getAccountStatus()).isEqualTo(AccountStatus.VERIFYING_EMAIL);
        verify(mail).send(any(SimpleMailMessage.class));
        verify(users).save(u);
    }

    @Test
    void acceptInvitation_setsPasswordActivatesAndClearsToken() {
        User u = user();
        u.setEmailVerificationToken("tok-123");
        u.setEmailVerificationExpiresAt(LocalDateTime.now().plusHours(1));
        u.setPasswordHash(User.DISABLED_PASSWORD_SENTINEL);
        when(users.findByEmailVerificationTokenForUpdate("tok-123")).thenReturn(Optional.of(u));
        when(passwords.encode("newpass123")).thenReturn("$2a$hash");

        service.acceptInvitation("tok-123", "newpass123");

        assertThat(u.getPasswordHash()).isEqualTo("$2a$hash");
        assertThat(u.getEmailVerificationToken()).isNull();
        assertThat(u.getEmailVerificationExpiresAt()).isNull();
        assertThat(u.getAccountStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(u.getTokenVersion()).isEqualTo(2);
    }

    @Test
    void acceptInvitation_rejectsExpiredTokenEvenWhenStatusStillVerifying() {
        // The race-condition case: sweeper hasn't run yet, DB still says
        // VERIFYING_EMAIL, but the token itself is past its TTL.
        User u = user();
        u.setEmailVerificationToken("tok-old");
        u.setEmailVerificationExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(users.findByEmailVerificationTokenForUpdate("tok-old")).thenReturn(Optional.of(u));

        assertThatThrownBy(() -> service.acceptInvitation("tok-old", "newpass123"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("invalid or has expired");
        assertThat(u.getAccountStatus()).isEqualTo(AccountStatus.VERIFYING_EMAIL);
    }

    @Test
    void acceptInvitation_rejectsUnknownToken() {
        when(users.findByEmailVerificationTokenForUpdate("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.acceptInvitation("nope", "newpass123"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void acceptInvitation_rejectsWeakPassword() {
        assertThatThrownBy(() -> service.acceptInvitation("tok", "short"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("at least 8");
    }

    @Test
    void sweepExpiredInvitations_flipsToPending() {
        User u = user();
        u.setEmailVerificationToken("tok-old");
        u.setEmailVerificationExpiresAt(LocalDateTime.now().minusHours(1));
        when(users.findExpiredVerifyingEmailUsers()).thenReturn(List.of(u));

        int swept = service.sweepExpiredInvitations();

        assertThat(swept).isEqualTo(1);
        assertThat(u.getAccountStatus()).isEqualTo(AccountStatus.PENDING);
        assertThat(u.getEmailVerificationToken()).isNull();
    }
}
