package com.evidencepilot.service.impl;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.evidencepilot.config.security.JwtSessionRegistry;
import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.dto.response.AuthResponse;
import com.evidencepilot.dto.response.UserResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AuditService;
import com.evidencepilot.service.UserInvitationService;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class UserInvitationServiceImpl implements UserInvitationService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JavaMailSender mailSender;
    private final AuditService audit;
    private final JwtUtils jwtUtils;
    private final JwtSessionRegistry sessionRegistry;
    private final String invitationUrl;
    private final Duration invitationTtl;
    private final SecureRandom secureRandom = new SecureRandom();

    @Autowired
    public UserInvitationServiceImpl(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            ObjectProvider<JavaMailSender> mailSenderProvider,
            AuditService audit,
            JwtUtils jwtUtils,
            JwtSessionRegistry sessionRegistry,
            @Value("${app.invitation.url:}") String invitationUrl,
            @Value("${app.invitation.ttl-hours:24}") long invitationTtlHours) {
        this(userRepository, passwordEncoder, mailSenderProvider.getIfAvailable(), audit,
                jwtUtils, sessionRegistry, invitationUrl, Duration.ofHours(invitationTtlHours));
    }

    UserInvitationServiceImpl(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JavaMailSender mailSender,
            AuditService audit,
            JwtUtils jwtUtils,
            JwtSessionRegistry sessionRegistry,
            String invitationUrl,
            Duration invitationTtl) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.mailSender = mailSender;
        this.audit = audit;
        this.jwtUtils = jwtUtils;
        this.sessionRegistry = sessionRegistry;
        this.invitationUrl = invitationUrl;
        this.invitationTtl = invitationTtl;
    }

    @Override
    @Transactional
    public void issueInvitation(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException(userId, "User"));

        byte[] tokenBytes = new byte[32];
        secureRandom.nextBytes(tokenBytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);

        user.setEmailVerificationToken(rawToken);
        user.setEmailVerificationExpiresAt(LocalDateTime.now().plus(invitationTtl));
        user.setAccountStatus(AccountStatus.VERIFYING_EMAIL);
        userRepository.save(user);

        sendInvitationEmail(user.getEmail(), rawToken);
        audit.record("INVITATION_ISSUED", "USER", user.getId(), user, null,
                java.util.Map.of("expiresAt", user.getEmailVerificationExpiresAt().toString()));
    }

    @Override
    @Transactional
    public AuthResponse acceptInvitation(String rawToken, String newPassword, String firstName, String lastName) {
        if (rawToken == null || rawToken.isBlank()) {
            throw badToken();
        }
        if (newPassword == null || newPassword.length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Password must be at least 8 characters");
        }

        User user = userRepository.findByEmailVerificationTokenForUpdate(rawToken)
                .orElseThrow(this::badToken);

        // Security gate at request time: the sweeper job is hygiene only and
        // must never be trusted to invalidate tokens.
        if (user.getEmailVerificationExpiresAt() == null
                || user.getEmailVerificationExpiresAt().isBefore(LocalDateTime.now())) {
            throw badToken();
        }

        if (firstName != null && !firstName.isBlank()) {
            user.setFirstName(firstName.trim());
        }
        if (lastName != null && !lastName.isBlank()) {
            user.setLastName(lastName.trim());
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setEmailVerificationToken(null);
        user.setEmailVerificationExpiresAt(null);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setPasswordChangeNoticePending(false);
        user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);

        audit.record("INVITATION_ACCEPTED", "USER", user.getId(), user, null, null);

        // ponytail: mint JWT on the spot so the FE can auto-login without a second round-trip.
        // tokenVersion was bumped above, invalidating any prior tokens.
        String token = jwtUtils.generateToken(user);
        sessionRegistry.register(jwtUtils.extractJti(token));
        return new AuthResponse(token, UserResponse.from(user), false);
    }

    @Override
    @Transactional(readOnly = true)
    public InvitationPreview previewInvitation(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw badToken();
        }
        User user = userRepository.findByEmailVerificationToken(rawToken).orElseThrow(this::badToken);
        if (user.getEmailVerificationExpiresAt() == null
                || user.getEmailVerificationExpiresAt().isBefore(LocalDateTime.now())) {
            throw badToken();
        }
        return new InvitationPreview(user.getEmail(), user.getRole().name(), user.getStudentCode(),
                user.getFirstName(), user.getLastName());
    }

    @Override
    @Transactional
    @Scheduled(cron = "${app.invitation.sweep-cron:0 0 3 * * *}")
    public int sweepExpiredInvitations() {
        List<User> expired = userRepository.findExpiredVerifyingEmailUsers();
        for (User user : expired) {
            user.setAccountStatus(AccountStatus.PENDING);
            user.setEmailVerificationToken(null);
            user.setEmailVerificationExpiresAt(null);
            userRepository.save(user);
            audit.record("INVITATION_EXPIRED", "USER", user.getId(), user, null, null);
        }
        if (!expired.isEmpty()) {
            log.info("Swept {} expired email-verification invitations to PENDING", expired.size());
        }
        return expired.size();
    }

    private void sendInvitationEmail(String to, String rawToken) {
        if (invitationUrl == null || invitationUrl.isBlank() || mailSender == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Invitation email is not configured");
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(to);
            message.setSubject("Set up your Evidence Pilot account");
            message.setText("Welcome to Evidence Pilot. Set your own password by opening this link:\n\n"
                    + invitationUrl + "?token=" + rawToken
                    + "\n\nThis link expires in " + invitationTtl.toHours() + " hours.");
            mailSender.send(message);
        } catch (MailException e) {
            log.warn("Failed to send invitation email to {}", to, e);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Invitation email could not be sent", e);
        }
    }

    private ResponseStatusException badToken() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Invitation link is invalid or has expired");
    }
}
