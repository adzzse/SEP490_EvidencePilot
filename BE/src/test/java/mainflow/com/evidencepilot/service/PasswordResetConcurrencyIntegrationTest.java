package com.evidencepilot.service;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import io.minio.MinioClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest
@TestPropertySource(properties = {
        "app.password-reset.url=https://app.test/reset",
        "app.mail.from=test@example.com"
})
class PasswordResetConcurrencyIntegrationTest {

    @Autowired
    private PasswordResetService service;

    @Autowired
    private UserRepository users;

    @MockBean
    private JavaMailSender mail;

    @MockBean
    private PasswordEncoder passwords;

    @MockBean(name = "minioClient")
    private MinioClient minioClient;

    @MockBean
    private RabbitTemplate rabbitTemplate;

    @AfterEach
    void cleanUsers() {
        users.deleteAll();
    }

    @Test
    void simultaneousPublicRequestsSendOnlyOneToken() throws Exception {
        User user = saveUser(UserRole.STUDENT, AccountStatus.ACTIVE);
        AtomicInteger sends = new AtomicInteger();
        CountDownLatch secondSend = new CountDownLatch(1);
        when(mail.createMimeMessage()).thenReturn(new jakarta.mail.internet.MimeMessage((jakarta.mail.Session) null));
        doAnswer(invocation -> {
            if (sends.incrementAndGet() == 1) {
                secondSend.await(1, TimeUnit.SECONDS);
            } else {
                secondSend.countDown();
            }
            return null;
        }).when(mail).send(any(jakarta.mail.internet.MimeMessage.class));

        runTogether(
                () -> service.requestReset(user.getEmail()),
                () -> service.requestReset(user.getEmail()));

        assertThat(sends).hasValue(1);
        User stored = users.findById(user.getId()).orElseThrow();
        assertThat(stored.getPasswordResetTokenHash()).isNotBlank();
    }

    @Test
    void simultaneousConfirmationsConsumeTokenExactlyOnce() throws Exception {
        User user = saveUser(UserRole.INSTRUCTOR, AccountStatus.ACTIVE);
        user.setPasswordResetTokenHash(hash("raw-token"));
        user.setPasswordResetTokenExpiresAt(LocalDateTime.now().plusMinutes(5));
        users.saveAndFlush(user);
        AtomicInteger encodes = new AtomicInteger();
        CountDownLatch secondEncode = new CountDownLatch(1);
        when(passwords.encode("NewStrongPass1!")).thenAnswer(invocation -> {
            if (encodes.incrementAndGet() == 1) {
                secondEncode.await(1, TimeUnit.SECONDS);
            } else {
                secondEncode.countDown();
            }
            return "new-hash";
        });
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger invalidTokens = new AtomicInteger();

        runTogether(
                () -> confirm(successes, invalidTokens),
                () -> confirm(successes, invalidTokens));

        assertThat(successes).hasValue(1);
        assertThat(invalidTokens).hasValue(1);
        assertThat(encodes).hasValue(1);
        User stored = users.findById(user.getId()).orElseThrow();
        assertThat(stored.getPasswordResetTokenHash()).isNull();
        assertThat(stored.getTokenVersion()).isEqualTo(1);
    }

    @Test
    void confirmedTokenCannotBeUsedAgainFromPersistence() throws Exception {
        User user = saveUser(UserRole.STUDENT, AccountStatus.PENDING);
        user.setPasswordResetTokenHash(hash("single-use"));
        user.setPasswordResetTokenExpiresAt(LocalDateTime.now().plusMinutes(5));
        users.saveAndFlush(user);
        when(passwords.encode("NewStrongPass1!")).thenReturn("new-hash");

        service.confirmReset("single-use", "NewStrongPass1!");

        assertThatThrownBy(() -> service.confirmReset("single-use", "NewStrongPass1!"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(400));
    }

    @Test
    void strictRequestRejectsIneligibleTargetWithConflict() {
        User admin = saveUser(UserRole.ADMIN, AccountStatus.ACTIVE);

        assertThatThrownBy(() -> service.requestResetFor(admin))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(409));
        verifyNoInteractions(mail);
    }

    @Test
    void strictRequestHonorsCooldownWithoutSending() {
        User user = saveUser(UserRole.STUDENT, AccountStatus.BANNED);
        user.setPasswordResetRequestedAt(LocalDateTime.now().minusSeconds(30));
        user.setPasswordResetTokenHash("existing");
        users.saveAndFlush(user);

        service.requestResetFor(user);

        verifyNoInteractions(mail);
        assertThat(users.findById(user.getId()).orElseThrow().getPasswordResetTokenHash()).isEqualTo("existing");
    }

    private void confirm(AtomicInteger successes, AtomicInteger invalidTokens) {
        try {
            service.confirmReset("raw-token", "NewStrongPass1!");
            successes.incrementAndGet();
        } catch (ResponseStatusException exception) {
            if (exception.getStatusCode().value() == 400) {
                invalidTokens.incrementAndGet();
            } else {
                throw exception;
            }
        }
    }

    private User saveUser(UserRole role, AccountStatus status) {
        User user = new User();
        user.setEmail(role.name().toLowerCase() + "-" + status.name().toLowerCase()
                + "-" + java.util.UUID.randomUUID() + "@test.com");
        user.setPasswordHash("existing-hash");
        user.setRole(role);
        user.setAccountStatus(status);
        return users.saveAndFlush(user);
    }

    private static void runTogether(Runnable first, Runnable second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var firstFuture = executor.submit(() -> runAfterSignal(first, ready, start));
            var secondFuture = executor.submit(() -> runAfterSignal(second, ready, start));
            assertThat(ready.await(2, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            firstFuture.get(5, TimeUnit.SECONDS);
            secondFuture.get(5, TimeUnit.SECONDS);
        }
    }

    private static void runAfterSignal(Runnable task, CountDownLatch ready, CountDownLatch start) {
        ready.countDown();
        try {
            if (!start.await(2, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Concurrent test did not start");
            }
            task.run();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    private static String hash(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}
