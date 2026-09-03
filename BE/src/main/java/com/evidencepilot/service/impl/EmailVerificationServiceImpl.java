package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.EmailChangeResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.EmailVerificationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
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
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

@Slf4j
@Service
public class EmailVerificationServiceImpl implements EmailVerificationService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private final UserRepository userRepository;
    private final JavaMailSender mailSender;
    private final String verificationUrl;
    private final Duration tokenTtl;
    private final Duration requestCooldown;
    private final SecureRandom secureRandom = new SecureRandom();

    @Autowired
    public EmailVerificationServiceImpl(
            UserRepository userRepository,
            ObjectProvider<JavaMailSender> mailSenderProvider,
            @Value("${app.email-verification.url:http://localhost:5173/profile}") String verificationUrl,
            @Value("${app.email-verification.token-ttl-minutes:60}") long tokenTtlMinutes,
            @Value("${app.email-verification.request-cooldown-seconds:60}") long requestCooldownSeconds) {
        this(userRepository, mailSenderProvider.getIfAvailable(), verificationUrl,
                Duration.ofMinutes(tokenTtlMinutes), Duration.ofSeconds(requestCooldownSeconds));
    }

    EmailVerificationServiceImpl(
            UserRepository userRepository,
            JavaMailSender mailSender,
            String verificationUrl,
            Duration tokenTtl,
            Duration requestCooldown) {
        this.userRepository = userRepository;
        this.mailSender = mailSender;
        this.verificationUrl = verificationUrl;
        this.tokenTtl = tokenTtl;
        this.requestCooldown = requestCooldown;
    }

    @Override
    @Transactional
    public EmailChangeResponse requestEmailChange(UUID userId, String newEmail) {
        if (newEmail == null || newEmail.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid new email address is required");
        }
        String normalizedEmail = newEmail.trim().toLowerCase(Locale.ROOT);
        if (!EMAIL_PATTERN.matcher(normalizedEmail).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid email address format");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException(userId, "User"));

        if (normalizedEmail.equalsIgnoreCase(user.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New email must be different from current email");
        }

        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email address is already in use by another account");
        }

        LocalDateTime now = LocalDateTime.now();
        if (user.getEmailVerificationRequestedAt() != null
                && user.getEmailVerificationRequestedAt().plus(requestCooldown).isAfter(now)) {
            long remaining = Duration.between(now, user.getEmailVerificationRequestedAt().plus(requestCooldown)).toSeconds();
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Please wait " + remaining + " seconds before requesting another email verification");
        }

        byte[] tokenBytes = new byte[32];
        secureRandom.nextBytes(tokenBytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);

        if (verificationUrl != null && !verificationUrl.isBlank() && mailSender != null) {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(normalizedEmail);
            message.setSubject("Verify your new Evidence Pilot email address");
            message.setText("Please verify your email address change by opening this link:\n\n"
                    + verificationUrl + "?verifyEmailToken=" + rawToken
                    + "\n\nThis link will expire in " + tokenTtl.toMinutes() + " minutes.");
            try {
                mailSender.send(message);
            } catch (MailException exception) {
                log.warn("Failed to send email verification to {}", normalizedEmail, exception);
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Email verification could not be sent. Please check your mail settings.", exception);
            }
        }

        user.setPendingEmail(normalizedEmail);
        user.setEmailVerificationTokenHash(hash(rawToken));
        user.setEmailVerificationTokenExpiresAt(now.plus(tokenTtl));
        user.setEmailVerificationRequestedAt(now);
        userRepository.save(user);

        return new EmailChangeResponse(
                "Verification email sent to " + normalizedEmail + ". Please check your inbox to confirm.",
                normalizedEmail,
                user.getEmailVerificationTokenExpiresAt()
        );
    }

    @Override
    @Transactional
    public void confirmEmailChange(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw badToken();
        }

        User user = userRepository.findByEmailVerificationTokenHashForUpdate(hash(rawToken))
                .orElseThrow(this::badToken);

        if (user.getEmailVerificationTokenExpiresAt() == null
                || user.getEmailVerificationTokenExpiresAt().isBefore(LocalDateTime.now())
                || user.getPendingEmail() == null) {
            throw badToken();
        }

        String pending = user.getPendingEmail();
        if (userRepository.existsByEmailIgnoreCase(pending)) {
            // Check if someone else registered this email in the interim
            user.setPendingEmail(null);
            user.setEmailVerificationTokenHash(null);
            user.setEmailVerificationTokenExpiresAt(null);
            user.setEmailVerificationRequestedAt(null);
            userRepository.save(user);
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email address is already in use by another account");
        }

        user.setEmail(pending);
        user.setPendingEmail(null);
        user.setEmailVerificationTokenHash(null);
        user.setEmailVerificationTokenExpiresAt(null);
        user.setEmailVerificationRequestedAt(null);
        user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);
    }

    @Override
    @Transactional
    public void cancelEmailChange(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException(userId, "User"));
        user.setPendingEmail(null);
        user.setEmailVerificationTokenHash(null);
        user.setEmailVerificationTokenExpiresAt(null);
        user.setEmailVerificationRequestedAt(null);
        userRepository.save(user);
    }

    private ResponseStatusException badToken() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Verification link is invalid or has expired");
    }

    private String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
