package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.EmailOtpRequestResponse;
import com.evidencepilot.dto.response.EmailOtpVerifyResponse;
import com.evidencepilot.model.EmailOtpClaim;
import com.evidencepilot.model.EmailOtpToken;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.EmailOtpClaimRepository;
import com.evidencepilot.repository.EmailOtpTokenRepository;
import com.evidencepilot.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class EmailOtpServiceImplTest {

    private UserRepository userRepository;
    private EmailOtpTokenRepository tokenRepository;
    private EmailOtpClaimRepository claimRepository;
    private EmailOtpServiceImpl service;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        tokenRepository = mock(EmailOtpTokenRepository.class);
        claimRepository = mock(EmailOtpClaimRepository.class);
        org.springframework.beans.factory.ObjectProvider<org.springframework.mail.javamail.JavaMailSender> mailProvider =
                mock(org.springframework.beans.factory.ObjectProvider.class);
        service = new EmailOtpServiceImpl(
                userRepository, tokenRepository, claimRepository,
                mailProvider, 5, 60, 10);
    }

    private User userWith(String email) {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setEmail(email);
        return u;
    }

    @Test
    void requestOtp_rejectsInvalidEmail() {
        User u = userWith("user@example.com");
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));

        assertThatThrownBy(() -> service.requestOtp(u.getId(), "not-an-email"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid");
    }

    @Test
    void requestOtp_rejectsSameAsCurrentEmail() {
        User u = userWith("user@example.com");
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));

        assertThatThrownBy(() -> service.requestOtp(u.getId(), "user@example.com"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("different");
    }

    @Test
    void requestOtp_rejectsAlreadyTakenEmail() {
        User u = userWith("user@example.com");
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(userRepository.existsByEmailIgnoreCase("taken@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.requestOtp(u.getId(), "taken@example.com"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already in use");
    }

    @Test
    void requestOtp_throttlesWhileCooldownActive() {
        User u = userWith("user@example.com");
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));

        EmailOtpToken existing = new EmailOtpToken();
        existing.setUser(u);
        existing.setEmail("new@example.com");
        existing.setCodeHash("h");
        existing.setCooldownUntil(LocalDateTime.now().plusSeconds(30));
        when(tokenRepository.findTopByUserIdAndEmailAndVerifiedAtIsNullOrderByCreatedAtDesc(u.getId(), "new@example.com"))
                .thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.requestOtp(u.getId(), "new@example.com"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("wait");
    }

    @Test
    void requestOtp_persistsTokenAndReturnsCooldown() {
        User u = userWith("user@example.com");
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(tokenRepository.findTopByUserIdAndEmailAndVerifiedAtIsNullOrderByCreatedAtDesc(any(), any()))
                .thenReturn(Optional.empty());
        when(tokenRepository.save(any(EmailOtpToken.class))).thenAnswer(inv -> inv.getArgument(0));

        EmailOtpRequestResponse resp = service.requestOtp(u.getId(), "new@example.com");

        assertThat(resp.email()).isEqualTo("new@example.com");
        assertThat(resp.cooldownUntil()).isAfter(LocalDateTime.now().plusSeconds(55));
        verify(tokenRepository).deleteUnverifiedByUserId(u.getId());
        verify(tokenRepository).save(any(EmailOtpToken.class));
    }

    @Test
    void verifyOtp_rejectsExpiredToken() {
        User u = userWith("user@example.com");
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));

        EmailOtpToken expired = new EmailOtpToken();
        expired.setUser(u);
        expired.setEmail("new@example.com");
        expired.setCodeHash("h");
        expired.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(tokenRepository.findTopByUserIdAndEmailAndVerifiedAtIsNullOrderByCreatedAtDesc(u.getId(), "new@example.com"))
                .thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.verifyOtp(u.getId(), "new@example.com", "123456"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("expired");
    }

    @Test
    void verifyOtp_wrongCode_incrementsAttemptsAndFails() {
        User u = userWith("user@example.com");
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));

        EmailOtpToken token = new EmailOtpToken();
        token.setUser(u);
        token.setEmail("new@example.com");
        token.setCodeHash(hash("000000"));
        token.setAttempts(0);
        token.setExpiresAt(LocalDateTime.now().plusMinutes(5));
        when(tokenRepository.findTopByUserIdAndEmailAndVerifiedAtIsNullOrderByCreatedAtDesc(u.getId(), "new@example.com"))
                .thenReturn(Optional.of(token));
        when(tokenRepository.save(any(EmailOtpToken.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThatThrownBy(() -> service.verifyOtp(u.getId(), "new@example.com", "111111"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid");

        assertThat(token.getAttempts()).isEqualTo(1);
        verify(claimRepository, never()).save(any());
    }

    @Test
    void verifyOtp_locksAfterThreeFailedAttempts() {
        User u = userWith("user@example.com");
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));

        EmailOtpToken token = new EmailOtpToken();
        token.setUser(u);
        token.setEmail("new@example.com");
        token.setCodeHash(hash("000000"));
        token.setAttempts(3);
        token.setExpiresAt(LocalDateTime.now().plusMinutes(5));
        when(tokenRepository.findTopByUserIdAndEmailAndVerifiedAtIsNullOrderByCreatedAtDesc(u.getId(), "new@example.com"))
                .thenReturn(Optional.of(token));

        assertThatThrownBy(() -> service.verifyOtp(u.getId(), "new@example.com", "111111"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Too many");
    }

    @Test
    void verifyOtp_correctCode_issuesClaim() {
        User u = userWith("user@example.com");
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));

        String code = "123456";
        EmailOtpToken token = new EmailOtpToken();
        token.setUser(u);
        token.setEmail("new@example.com");
        token.setCodeHash(hash(code));
        token.setAttempts(0);
        token.setExpiresAt(LocalDateTime.now().plusMinutes(5));
        when(tokenRepository.findTopByUserIdAndEmailAndVerifiedAtIsNullOrderByCreatedAtDesc(u.getId(), "new@example.com"))
                .thenReturn(Optional.of(token));
        when(tokenRepository.save(any(EmailOtpToken.class))).thenAnswer(inv -> inv.getArgument(0));
        when(claimRepository.save(any(EmailOtpClaim.class))).thenAnswer(inv -> inv.getArgument(0));

        EmailOtpVerifyResponse resp = service.verifyOtp(u.getId(), "new@example.com", code);

        assertThat(resp.claimToken()).isNotBlank();
        assertThat(token.getVerifiedAt()).isNotNull();
    }

    @Test
    void consumeClaim_validatesUserEmailAndExpiry() throws Exception {
        User u = userWith("user@example.com");
        u.setId(UUID.randomUUID());
        String raw = "raw-claim-token";
        EmailOtpClaim claim = new EmailOtpClaim();
        setField(claim, "tokenHash", hash(raw));
        claim.setUser(u);
        claim.setEmail("new@example.com");
        claim.setExpiresAt(LocalDateTime.now().plusMinutes(5));
        claim.setCreatedAt(LocalDateTime.now());
        when(claimRepository.findById(hash(raw))).thenReturn(Optional.of(claim));
        when(claimRepository.save(any(EmailOtpClaim.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThat(service.consumeClaim(u.getId(), "new@example.com", raw)).isTrue();
        assertThat(claim.getConsumedAt()).isNotNull();

        // second use fails
        assertThat(service.consumeClaim(u.getId(), "new@example.com", raw)).isFalse();
    }

    @Test
    void consumeClaim_rejectsEmailMismatch() {
        User u = userWith("user@example.com");
        String raw = "x";
        EmailOtpClaim claim = new EmailOtpClaim();
        claim.setTokenHash(hash(raw));
        claim.setUser(u);
        claim.setEmail("new@example.com");
        claim.setExpiresAt(LocalDateTime.now().plusMinutes(5));
        claim.setCreatedAt(LocalDateTime.now());
        when(claimRepository.findById(hash(raw))).thenReturn(Optional.of(claim));

        assertThat(service.consumeClaim(u.getId(), "different@example.com", raw)).isFalse();
    }

    private static String hash(String value) {
        try {
            var d = java.security.MessageDigest.getInstance("SHA-256");
            byte[] h = d.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(h);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }
}
