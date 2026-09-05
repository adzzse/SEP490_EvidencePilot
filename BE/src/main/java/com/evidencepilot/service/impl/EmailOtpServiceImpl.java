package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.EmailOtpRequestResponse;
import com.evidencepilot.dto.response.EmailOtpVerifyResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.EmailOtpClaim;
import com.evidencepilot.model.EmailOtpToken;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.EmailOtpClaimRepository;
import com.evidencepilot.repository.EmailOtpTokenRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.EmailOtpService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
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
public class EmailOtpServiceImpl implements EmailOtpService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final int MAX_ATTEMPTS = 3;

    private final UserRepository userRepository;
    private final EmailOtpTokenRepository otpTokenRepository;
    private final EmailOtpClaimRepository otpClaimRepository;
    private final JavaMailSender mailSender;
    private final Duration tokenTtl;
    private final Duration cooldown;
    private final Duration claimTtl;
    private final SecureRandom secureRandom = new SecureRandom();

    public EmailOtpServiceImpl(
            UserRepository userRepository,
            EmailOtpTokenRepository otpTokenRepository,
            EmailOtpClaimRepository otpClaimRepository,
            ObjectProvider<JavaMailSender> mailSenderProvider,
            @Value("${app.email-otp.token-ttl-minutes:5}") long tokenTtlMinutes,
            @Value("${app.email-otp.cooldown-seconds:60}") long cooldownSeconds,
            @Value("${app.email-otp.claim-ttl-minutes:10}") long claimTtlMinutes) {
        this.userRepository = userRepository;
        this.otpTokenRepository = otpTokenRepository;
        this.otpClaimRepository = otpClaimRepository;
        this.mailSender = mailSenderProvider.getIfAvailable();
        this.tokenTtl = Duration.ofMinutes(tokenTtlMinutes);
        this.cooldown = Duration.ofSeconds(cooldownSeconds);
        this.claimTtl = Duration.ofMinutes(claimTtlMinutes);
    }

    @Override
    @Transactional
    public EmailOtpRequestResponse requestOtp(UUID userId, String email) {
        if (email == null || email.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid email address is required");
        }
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (!EMAIL_PATTERN.matcher(normalized).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid email address format");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException(userId, "User"));

        if (normalized.equalsIgnoreCase(user.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New email must be different from current email");
        }
        if (userRepository.existsByEmailIgnoreCase(normalized)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email address is already in use by another account");
        }

        LocalDateTime now = LocalDateTime.now();
        var existing = otpTokenRepository.findTopByUserIdAndEmailAndVerifiedAtIsNullOrderByCreatedAtDesc(userId, normalized);
        if (existing.isPresent() && existing.get().getCooldownUntil() != null
                && existing.get().getCooldownUntil().isAfter(now)) {
            long remaining = Duration.between(now, existing.get().getCooldownUntil()).toSeconds();
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Please wait " + remaining + " seconds before requesting another code");
        }

        // Invalidate prior unverified codes for this (user, email) so only the latest is active.
        otpTokenRepository.deleteUnverifiedByUserId(userId);

        String code = generateCode();
        EmailOtpToken token = new EmailOtpToken();
        token.setUser(user);
        token.setEmail(normalized);
        token.setCodeHash(hash(code));
        token.setAttempts(0);
        token.setExpiresAt(now.plus(tokenTtl));
        token.setCooldownUntil(now.plus(cooldown));
        token.setCreatedAt(now);
        otpTokenRepository.save(token);

        sendOtpEmail(normalized, code);

        return new EmailOtpRequestResponse(
                "Verification code sent to " + normalized + ". It expires in " + tokenTtl.toMinutes() + " minutes.",
                normalized,
                token.getCooldownUntil()
        );
    }

    @Override
    @Transactional
    public EmailOtpVerifyResponse verifyOtp(UUID userId, String email, String code) {
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException(userId, "User"));

        EmailOtpToken token = otpTokenRepository
                .findTopByUserIdAndEmailAndVerifiedAtIsNullOrderByCreatedAtDesc(userId, normalized)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No active verification code for this email"));

        if (token.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Verification code has expired");
        }
        if (token.getAttempts() >= MAX_ATTEMPTS) {
            throw new ResponseStatusException(HttpStatus.LOCKED, "Too many failed attempts. Request a new code.");
        }

        token.setAttempts(token.getAttempts() + 1);

        if (!constantTimeEquals(token.getCodeHash(), hash(code))) {
            otpTokenRepository.save(token);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid verification code");
        }

        token.setVerifiedAt(LocalDateTime.now());
        otpTokenRepository.save(token);

        String rawClaim = generateClaimToken();
        EmailOtpClaim claim = new EmailOtpClaim();
        claim.setTokenHash(hash(rawClaim));
        claim.setUser(user);
        claim.setEmail(normalized);
        claim.setExpiresAt(LocalDateTime.now().plus(claimTtl));
        claim.setCreatedAt(LocalDateTime.now());
        otpClaimRepository.save(claim);

        return new EmailOtpVerifyResponse(
                "Email verified. Apply the change by saving your profile.",
                normalized,
                rawClaim,
                claim.getExpiresAt()
        );
    }

    @Override
    @Transactional
    public boolean consumeClaim(UUID userId, String newEmail, String rawClaimToken) {
        if (rawClaimToken == null || rawClaimToken.isBlank() || newEmail == null) {
            return false;
        }
        String hash = hash(rawClaimToken);
        EmailOtpClaim claim = otpClaimRepository.findById(hash).orElse(null);
        if (claim == null) return false;
        if (claim.getConsumedAt() != null) return false;
        if (claim.getExpiresAt().isBefore(LocalDateTime.now())) return false;
        if (!claim.getUser().getId().equals(userId)) return false;
        if (!claim.getEmail().equalsIgnoreCase(newEmail.trim())) return false;

        claim.setConsumedAt(LocalDateTime.now());
        otpClaimRepository.save(claim);
        return true;
    }

    private void sendOtpEmail(String to, String code) {
        if (mailSender == null) {
            log.warn("JavaMailSender not configured; OTP code for {} is {}", to, code);
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(to);
            message.setSubject("Your Evidence Pilot verification code");
            message.setText("Your verification code is: " + code
                    + "\n\nIt expires in " + tokenTtl.toMinutes() + " minutes. "
                    + "If you didn't request this, you can ignore this email.");
            mailSender.send(message);
        } catch (MailException e) {
            log.warn("Failed to send OTP email to {}", to, e);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Verification code could not be sent. Please try again later.", e);
        }
    }

    private String generateCode() {
        int n = secureRandom.nextInt(1_000_000);
        return String.format("%06d", n);
    }

    private String generateClaimToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) {
            diff |= a.charAt(i) ^ b.charAt(i);
        }
        return diff == 0;
    }

    private String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] h = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
