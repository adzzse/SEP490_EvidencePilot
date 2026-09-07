package com.evidencepilot.service;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class PasswordResetServiceTest {

    private final UserRepository users = mock(UserRepository.class);
    private final JavaMailSender mail = mock(JavaMailSender.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final PasswordResetService service = new PasswordResetService(
            users, new HtmlMailService(mail, "no-reply@test.local"), passwords,
            "https://app.test/reset", Duration.ofMinutes(60), Duration.ofSeconds(60));

    @ParameterizedTest
    @MethodSource("eligibleAccounts")
    void eligibleStudentAndInstructorStatusesReceiveHashOnlyToken(UserRole role, AccountStatus status) throws Exception {
        User user = user(role, status);
        when(users.findByEmailForPasswordReset(user.getEmail())).thenReturn(Optional.of(user));
        when(mail.createMimeMessage()).thenReturn(new MimeMessage((Session) null));

        service.requestReset(user.getEmail());

        var message = org.mockito.ArgumentCaptor.forClass(MimeMessage.class);
        verify(mail).send(message.capture());
        String html = htmlBody(message.getValue());
        java.util.regex.Matcher token = java.util.regex.Pattern.compile("token=([A-Za-z0-9_-]+)").matcher(html);
        assertThat(token.find()).isTrue();
        String rawToken = token.group(1);
        assertThat(rawToken).hasSize(43);
        assertThat(html).contains("EVIDENCE PILOT");
        assertThat(user.getPasswordResetTokenHash()).isEqualTo(hash(rawToken)).isNotEqualTo(rawToken);
        assertThat(user.getPasswordResetTokenExpiresAt()).isAfter(LocalDateTime.now().plusMinutes(59));
        assertThat(user.getPasswordResetRequestedAt()).isNotNull();
        verify(users).save(user);
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
    void unknownAdminDeletedAndCooldownDoNotSendOrReplace() {
        assertThatCode(() -> service.requestReset("unknown@test.com")).doesNotThrowAnyException();

        User admin = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        when(users.findByEmailForPasswordReset(admin.getEmail())).thenReturn(Optional.of(admin));
        service.requestReset(admin.getEmail());

        User deleted = user(UserRole.STUDENT, AccountStatus.DELETED);
        deleted.setEmail("deleted@test.com");
        when(users.findByEmailForPasswordReset(deleted.getEmail())).thenReturn(Optional.of(deleted));
        service.requestReset(deleted.getEmail());

        User cooling = user(UserRole.INSTRUCTOR, AccountStatus.BANNED);
        cooling.setEmail("cooling@test.com");
        cooling.setPasswordResetTokenHash("existing");
        cooling.setPasswordResetRequestedAt(LocalDateTime.now().minusSeconds(30));
        when(users.findByEmailForPasswordReset(cooling.getEmail())).thenReturn(Optional.of(cooling));
        service.requestReset(cooling.getEmail());

        assertThat(cooling.getPasswordResetTokenHash()).isEqualTo("existing");
        verifyNoInteractions(mail);
        verify(users, never()).save(any());
    }

    @ParameterizedTest
    @MethodSource("resetTransitions")
    void confirmationPreservesRequiredStatus(AccountStatus before, AccountStatus after) throws Exception {
        User user = user(UserRole.STUDENT, before);
        user.setPasswordChangeNoticePending(true);
        user.setTokenVersion(4);
        user.setPasswordResetTokenHash(hash("raw-token"));
        user.setPasswordResetTokenExpiresAt(LocalDateTime.now().plusMinutes(5));
        user.setPasswordResetRequestedAt(LocalDateTime.now().minusMinutes(1));
        when(users.findByPasswordResetTokenHashForUpdate(hash("raw-token")))
                .thenReturn(Optional.of(user));
        when(passwords.encode("NewStrongPass1!")).thenReturn("new-hash");

        service.confirmReset("raw-token", "NewStrongPass1!");

        assertThat(user.getPasswordHash()).isEqualTo("new-hash");
        assertThat(user.getPasswordResetTokenHash()).isNull();
        assertThat(user.getPasswordResetTokenExpiresAt()).isNull();
        assertThat(user.getPasswordResetRequestedAt()).isNull();
        assertThat(user.isPasswordChangeNoticePending()).isFalse();
        assertThat(user.getTokenVersion()).isEqualTo(5);
        assertThat(user.getAccountStatus()).isEqualTo(after);
    }

    @Test
    void confirmationRejectsBlankUnknownAndExpiredTokens() throws Exception {
        assertBadRequest(() -> service.confirmReset(" ", "NewStrongPass1!"));
        when(users.findByPasswordResetTokenHashForUpdate(hash("unknown"))).thenReturn(Optional.empty());
        assertBadRequest(() -> service.confirmReset("unknown", "NewStrongPass1!"));

        User expired = user(UserRole.STUDENT, AccountStatus.ACTIVE);
        expired.setPasswordResetTokenExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(users.findByPasswordResetTokenHashForUpdate(hash("expired"))).thenReturn(Optional.of(expired));
        assertBadRequest(() -> service.confirmReset("expired", "NewStrongPass1!"));
    }

    @Test
    void confirmationRejectsTokenWhenAccountBecameDeleted() throws Exception {
        User deleted = user(UserRole.STUDENT, AccountStatus.DELETED);
        deleted.setPasswordResetTokenExpiresAt(LocalDateTime.now().plusMinutes(5));
        when(users.findByPasswordResetTokenHashForUpdate(hash("deleted"))).thenReturn(Optional.of(deleted));

        assertBadRequest(() -> service.confirmReset("deleted", "NewStrongPass1!"));
        verifyNoInteractions(passwords);
    }

    @Test
    void publicRequestPropagatesMailFailureForControllerToSuppress() {
        User user = user(UserRole.STUDENT, AccountStatus.ACTIVE);
        when(mail.createMimeMessage()).thenReturn(new MimeMessage((Session) null));
        doThrow(new org.springframework.mail.MailSendException("down")).when(mail).send(any(MimeMessage.class));
        when(users.findByEmailForPasswordReset(user.getEmail())).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> service.requestReset(user.getEmail()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(503));
        verify(users, never()).save(any());
    }

    private static Stream<Arguments> eligibleAccounts() {
        return Stream.of(UserRole.STUDENT, UserRole.INSTRUCTOR)
                .flatMap(role -> Stream.of(AccountStatus.PENDING, AccountStatus.ACTIVE, AccountStatus.BANNED)
                        .map(status -> Arguments.of(role, status)));
    }

    private static Stream<Arguments> resetTransitions() {
        return Stream.of(
                Arguments.of(AccountStatus.PENDING, AccountStatus.ACTIVE),
                Arguments.of(AccountStatus.ACTIVE, AccountStatus.ACTIVE),
                Arguments.of(AccountStatus.BANNED, AccountStatus.BANNED));
    }

    private static User user(UserRole role, AccountStatus status) {
        User user = new User();
        user.setEmail(role.name().toLowerCase() + "-" + status.name().toLowerCase() + "@test.com");
        user.setRole(role);
        user.setAccountStatus(status);
        return user;
    }

    private static String hash(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static void assertBadRequest(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action)
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(400));
    }
}
