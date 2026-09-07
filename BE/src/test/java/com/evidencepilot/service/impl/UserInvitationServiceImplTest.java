package com.evidencepilot.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import com.evidencepilot.config.security.JwtSessionRegistry;
import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.dto.response.AuthResponse;
import com.evidencepilot.event.EntityChangedEvent;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AuditService;
import com.evidencepilot.service.HtmlMailService;
import com.evidencepilot.service.UserInvitationService;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;

class UserInvitationServiceImplTest {

    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final JavaMailSender mail = mock(JavaMailSender.class);
    private final HtmlMailService htmlMail = new HtmlMailService(mail, "no-reply@test.local");
    private final AuditService audit = mock(AuditService.class);
    private final JwtUtils jwtUtils = mock(JwtUtils.class);
    private final JwtSessionRegistry sessionRegistry = mock(JwtSessionRegistry.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final UserInvitationServiceImpl service = new UserInvitationServiceImpl(
            users, passwords, htmlMail, audit, jwtUtils, sessionRegistry, events,
            "https://app.test/set-password", Duration.ofHours(24));

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
    void issueInvitation_setsTokenExpiryStatusAndSendsMail() throws Exception {
        User u = user();
        u.setAccountStatus(AccountStatus.PENDING);
        when(users.findById(u.getId())).thenReturn(Optional.of(u));
        when(mail.createMimeMessage()).thenReturn(new MimeMessage((Session) null));

        service.issueInvitation(u.getId());

        assertThat(u.getEmailVerificationToken()).isNotBlank();
        assertThat(u.getEmailVerificationExpiresAt()).isAfter(LocalDateTime.now().plusHours(23));
        assertThat(u.getAccountStatus()).isEqualTo(AccountStatus.VERIFYING_EMAIL);
        var sent = org.mockito.ArgumentCaptor.forClass(MimeMessage.class);
        verify(mail).send(sent.capture());
        assertThat(sent.getValue().getSubject()).isEqualTo("Set up your Evidence Pilot account");
        assertThat(htmlBody(sent.getValue())).contains("EVIDENCE PILOT")
                .contains("https://app.test/set-password?token=" + u.getEmailVerificationToken());
        verify(users).save(u);
    }

    private static String htmlBody(MimeMessage message) throws Exception {
        StringBuilder body = new StringBuilder();
        appendBody(message.getContent(), body);
        return body.toString();
    }

    private static void appendBody(Object content, StringBuilder body) throws Exception {
        if (content instanceof jakarta.mail.Multipart multipart) {
            for (int i = 0; i < multipart.getCount(); i++) {
                appendBody(multipart.getBodyPart(i).getContent(), body);
            }
        } else if (content != null) {
            body.append(content);
        }
    }

    @Test
    void acceptInvitation_setsPasswordActivatesAndClearsToken() {
        User u = user();
        u.setEmailVerificationToken("tok-123");
        u.setEmailVerificationExpiresAt(LocalDateTime.now().plusHours(1));
        u.setPasswordHash(User.DISABLED_PASSWORD_SENTINEL);
        when(users.findByEmailVerificationTokenForUpdate("tok-123")).thenReturn(Optional.of(u));
        when(passwords.encode("newpass123")).thenReturn("$2a$hash");
        when(jwtUtils.generateToken(u)).thenReturn("jwt-abc");
        when(jwtUtils.extractJti("jwt-abc")).thenReturn("jti-1");

        AuthResponse response = service.acceptInvitation("tok-123", "newpass123", "Ada", "Lovelace");

        assertThat(u.getPasswordHash()).isEqualTo("$2a$hash");
        assertThat(u.getEmailVerificationToken()).isNull();
        assertThat(u.getEmailVerificationExpiresAt()).isNull();
        assertThat(u.getAccountStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(u.getTokenVersion()).isEqualTo(2);
        assertThat(u.getFirstName()).isEqualTo("Ada");
        assertThat(u.getLastName()).isEqualTo("Lovelace");
        assertThat(response).isNotNull();
        assertThat(response.getToken()).isEqualTo("jwt-abc");
        assertThat(response.isPasswordChangeNotice()).isFalse();
        verify(sessionRegistry).register("jti-1");
    }

    @Test
    void acceptInvitation_skipsBlankNames() {
        User u = user();
        u.setFirstName("Original");
        u.setLastName("Name");
        u.setEmailVerificationToken("tok-124");
        u.setEmailVerificationExpiresAt(LocalDateTime.now().plusHours(1));
        u.setPasswordHash(User.DISABLED_PASSWORD_SENTINEL);
        when(users.findByEmailVerificationTokenForUpdate("tok-124")).thenReturn(Optional.of(u));
        when(passwords.encode("newpass123")).thenReturn("$2a$hash");
        when(jwtUtils.generateToken(u)).thenReturn("jwt-xyz");
        when(jwtUtils.extractJti("jwt-xyz")).thenReturn("jti-2");

        service.acceptInvitation("tok-124", "newpass123", "  ", null);

        assertThat(u.getFirstName()).isEqualTo("Original");
        assertThat(u.getLastName()).isEqualTo("Name");
    }

    @Test
    void acceptInvitation_rejectsExpiredTokenEvenWhenStatusStillVerifying() {
        // The race-condition case: sweeper hasn't run yet, DB still says
        // VERIFYING_EMAIL, but the token itself is past its TTL.
        User u = user();
        u.setEmailVerificationToken("tok-old");
        u.setEmailVerificationExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(users.findByEmailVerificationTokenForUpdate("tok-old")).thenReturn(Optional.of(u));

        assertThatThrownBy(() -> service.acceptInvitation("tok-old", "newpass123", null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("invalid or has expired");
        assertThat(u.getAccountStatus()).isEqualTo(AccountStatus.VERIFYING_EMAIL);
    }

    @Test
    void acceptInvitation_rejectsUnknownToken() {
        when(users.findByEmailVerificationTokenForUpdate("nope")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.acceptInvitation("nope", "newpass123", null, null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void acceptInvitation_rejectsWeakPassword() {
        assertThatThrownBy(() -> service.acceptInvitation("tok", "short", null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("at least 8");
    }

    @Test
    void previewInvitation_returnsContextForValidToken() {
        User u = user();
        u.setEmail("ada@test.com");
        u.setStudentCode("STU-001");
        u.setFirstName("Ada");
        u.setLastName("Lovelace");
        u.setEmailVerificationToken("tok-prev");
        u.setEmailVerificationExpiresAt(LocalDateTime.now().plusHours(1));
        when(users.findByEmailVerificationToken("tok-prev")).thenReturn(Optional.of(u));

        UserInvitationService.InvitationPreview preview = service.previewInvitation("tok-prev");

        assertThat(preview.email()).isEqualTo("ada@test.com");
        assertThat(preview.role()).isEqualTo("STUDENT");
        assertThat(preview.studentCode()).isEqualTo("STU-001");
        assertThat(preview.firstName()).isEqualTo("Ada");
        assertThat(preview.lastName()).isEqualTo("Lovelace");
    }

    @Test
    void previewInvitation_passesThroughBlankNames() {
        User u = user();
        u.setFirstName(null);
        u.setLastName("");
        u.setEmailVerificationToken("tok-prev2");
        u.setEmailVerificationExpiresAt(LocalDateTime.now().plusHours(1));
        when(users.findByEmailVerificationToken("tok-prev2")).thenReturn(Optional.of(u));

        UserInvitationService.InvitationPreview preview = service.previewInvitation("tok-prev2");

        assertThat(preview.firstName()).isNull();
        assertThat(preview.lastName()).isEmpty();
    }

    @Test
    void previewInvitation_rejectsExpiredToken() {
        when(users.findByEmailVerificationToken("expired")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.previewInvitation("expired"))
                .isInstanceOf(ResponseStatusException.class);
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

    @Test
    void issueInvitation_firesEntityChangedEvent() throws Exception {
        User u = user();
        u.setAccountStatus(AccountStatus.PENDING);
        when(users.findById(u.getId())).thenReturn(Optional.of(u));
        when(mail.createMimeMessage()).thenReturn(new MimeMessage((Session) null));

        service.issueInvitation(u.getId());

        ArgumentCaptor<EntityChangedEvent> captor = ArgumentCaptor.forClass(EntityChangedEvent.class);
        verify(events, times(1)).publishEvent(captor.capture());
        EntityChangedEvent evt = captor.getValue();
        assertThat(evt.entity()).isEqualTo("USER");
        assertThat(evt.id()).isEqualTo(u.getId());
        assertThat(evt.action()).isEqualTo("STATUS_CHANGED");
        assertThat(evt.projectId()).isNull();
    }

    @Test
    void acceptInvitation_firesEntityChangedEvent() {
        User u = user();
        u.setEmailVerificationToken("tok-evt");
        u.setEmailVerificationExpiresAt(LocalDateTime.now().plusHours(1));
        u.setPasswordHash(User.DISABLED_PASSWORD_SENTINEL);
        when(users.findByEmailVerificationTokenForUpdate("tok-evt")).thenReturn(Optional.of(u));
        when(passwords.encode("newpass123")).thenReturn("$2a$hash");
        when(jwtUtils.generateToken(u)).thenReturn("jwt-evt");
        when(jwtUtils.extractJti("jwt-evt")).thenReturn("jti-evt");

        service.acceptInvitation("tok-evt", "newpass123", "Ada", "Lovelace");

        ArgumentCaptor<EntityChangedEvent> captor = ArgumentCaptor.forClass(EntityChangedEvent.class);
        verify(events, times(1)).publishEvent(captor.capture());
        EntityChangedEvent evt = captor.getValue();
        assertThat(evt.entity()).isEqualTo("USER");
        assertThat(evt.id()).isEqualTo(u.getId());
        assertThat(evt.action()).isEqualTo("STATUS_CHANGED");
        assertThat(evt.projectId()).isNull();
    }

    @Test
    void sweepExpiredInvitations_firesSingleBulkEventWhenSwept() {
        User a = user();
        a.setEmailVerificationToken("tok-a");
        a.setEmailVerificationExpiresAt(LocalDateTime.now().minusHours(1));
        User b = user();
        b.setEmailVerificationToken("tok-b");
        b.setEmailVerificationExpiresAt(LocalDateTime.now().minusHours(2));
        User c = user();
        c.setEmailVerificationToken("tok-c");
        c.setEmailVerificationExpiresAt(LocalDateTime.now().minusHours(3));
        when(users.findExpiredVerifyingEmailUsers()).thenReturn(List.of(a, b, c));

        int swept = service.sweepExpiredInvitations();

        assertThat(swept).isEqualTo(3);
        ArgumentCaptor<EntityChangedEvent> captor = ArgumentCaptor.forClass(EntityChangedEvent.class);
        verify(events, times(1)).publishEvent(captor.capture());
        EntityChangedEvent evt = captor.getValue();
        assertThat(evt.entity()).isEqualTo("USER");
        assertThat(evt.id()).isNull();
        assertThat(evt.action()).isEqualTo("STATUS_CHANGED");
        assertThat(evt.projectId()).isNull();
    }

    @Test
    void sweepExpiredInvitations_firesNoEventWhenNothingToSweep() {
        when(users.findExpiredVerifyingEmailUsers()).thenReturn(List.of());

        int swept = service.sweepExpiredInvitations();

        assertThat(swept).isZero();
        verify(events, never()).publishEvent(any(EntityChangedEvent.class));
    }
}
