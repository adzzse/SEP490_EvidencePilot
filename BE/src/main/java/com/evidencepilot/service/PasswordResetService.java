package com.evidencepilot.service;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

@Service
public class PasswordResetService {

    private final UserRepository userRepository;
    private final HtmlMailService htmlMail;
    private final PasswordEncoder passwordEncoder;
    private final String resetUrl;
    private final Duration tokenTtl;
    private final Duration requestCooldown;
    private final SecureRandom secureRandom = new SecureRandom();

    @Autowired
    public PasswordResetService(
            UserRepository userRepository,
            HtmlMailService htmlMail,
            PasswordEncoder passwordEncoder,
            @Value("${app.password-reset.url:}") String resetUrl,
            @Value("${app.password-reset.token-ttl-minutes:60}") long tokenTtlMinutes,
            @Value("${app.password-reset.request-cooldown-seconds:60}") long requestCooldownSeconds) {
        this(userRepository, htmlMail, passwordEncoder, resetUrl,
                Duration.ofMinutes(tokenTtlMinutes), Duration.ofSeconds(requestCooldownSeconds));
    }

    PasswordResetService(
            UserRepository userRepository,
            HtmlMailService htmlMail,
            PasswordEncoder passwordEncoder,
            String resetUrl,
            Duration tokenTtl,
            Duration requestCooldown) {
        this.userRepository = userRepository;
        this.htmlMail = htmlMail;
        this.passwordEncoder = passwordEncoder;
        this.resetUrl = resetUrl;
        this.tokenTtl = tokenTtl;
        this.requestCooldown = requestCooldown;
    }

    @Transactional
    public void requestReset(String email) {
        userRepository.findByEmailForPasswordReset(email)
                .filter(this::isEligible)
                .filter(this::isCooldownComplete)
                .ifPresent(this::issueReset);
    }

    @Transactional
    public void requestResetFor(User user) {
        User lockedUser = userRepository.findByIdForPasswordReset(user.getId())
                .orElseThrow(this::ineligibleAccount);
        if (!isEligible(lockedUser)) {
            throw ineligibleAccount();
        }
        if (!isCooldownComplete(lockedUser)) {
            return;
        }
        issueReset(lockedUser);
    }

    private void issueReset(User user) {
        if (resetUrl == null || resetUrl.isBlank() || !htmlMail.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Password reset email is not configured");
        }

        byte[] tokenBytes = new byte[32];
        secureRandom.nextBytes(tokenBytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);

        try {
            htmlMail.send(user.getEmail(),
                    "Reset your Evidence Pilot password",
                    "Reset your password",
                    "Open the link below to choose a new password.",
                    resetUrl + "?token=" + rawToken,
                    "Reset my password",
                    "This link expires in " + tokenTtl.toMinutes() + " minutes.");
        } catch (MailException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Password reset email could not be sent", exception);
        }

        LocalDateTime now = LocalDateTime.now();
        user.setPasswordResetTokenHash(hash(rawToken));
        user.setPasswordResetTokenExpiresAt(now.plus(tokenTtl));
        user.setPasswordResetRequestedAt(now);
        userRepository.save(user);
    }

    @Transactional
    public void confirmReset(String rawToken, String newPassword) {
        if (rawToken == null || rawToken.isBlank()) {
            throw badToken();
        }

        User user = userRepository.findByPasswordResetTokenHashForUpdate(hash(rawToken))
                .orElseThrow(this::badToken);
        if (!isEligible(user)
                || user.getPasswordResetTokenExpiresAt() == null
                || user.getPasswordResetTokenExpiresAt().isBefore(LocalDateTime.now())) {
            throw badToken();
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPasswordResetTokenHash(null);
        user.setPasswordResetTokenExpiresAt(null);
        user.setPasswordResetRequestedAt(null);
        user.setPasswordChangeNoticePending(false);
        user.setTokenVersion(user.getTokenVersion() + 1);
        if (user.getAccountStatus() == AccountStatus.PENDING) {
            user.setAccountStatus(AccountStatus.ACTIVE);
        }
        userRepository.save(user);
    }

    private boolean isEligible(User user) {
        return (user.getRole() == UserRole.STUDENT || user.getRole() == UserRole.INSTRUCTOR)
                && user.getAccountStatus() != AccountStatus.DELETED;
    }

    private boolean isCooldownComplete(User user) {
        return user.getPasswordResetRequestedAt() == null
                || !user.getPasswordResetRequestedAt().plus(requestCooldown).isAfter(LocalDateTime.now());
    }

    private ResponseStatusException badToken() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid or expired password reset token");
    }

    private ResponseStatusException ineligibleAccount() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "Account is not eligible for password reset");
    }

    private String hash(String rawToken) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }
}
