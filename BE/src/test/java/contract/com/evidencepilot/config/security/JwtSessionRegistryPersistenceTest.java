package com.evidencepilot.config.security;

import com.evidencepilot.model.Session;
import com.evidencepilot.repository.SessionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Import(JwtSessionRegistry.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class JwtSessionRegistryPersistenceTest {

    @jakarta.annotation.Resource
    private SessionRepository sessions;

    @jakarta.annotation.Resource
    private JwtSessionRegistry registry;

    @Test
    void startupRemovesExpiredSessionsOutsideCallerTransaction() {
        LocalDateTime now = LocalDateTime.now();
        sessions.save(new Session("expired", null, now.minusHours(2), now.minusHours(1)));
        sessions.save(new Session("active", null, now, now.plusHours(1)));

        registry.removeExpiredSessions();

        assertThat(sessions.existsById("expired")).isFalse();
        assertThat(registry.isValid("expired")).isFalse();
        assertThat(registry.isValid("active")).isTrue();
    }

    @Test
    void concurrentRotationsHaveExactlyOneWinnerAcrossDatabaseReaders() throws Exception {
        LocalDateTime now = LocalDateTime.now();
        sessions.save(new Session("old", null, now, now.plusHours(1)));

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> rotateAfterSignal("new-a", ready, start));
            var second = executor.submit(() -> rotateAfterSignal("new-b", ready, start));
            assertThat(ready.await(2, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            assertThat(List.of(
                    first.get(10, TimeUnit.SECONDS),
                    second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }

        List<Session> rotated = sessions.findAllById(List.of("new-a", "new-b"));
        JwtSessionRegistry otherInstance = new JwtSessionRegistry(sessions, 60_000);
        assertThat(sessions.existsById("old")).isFalse();
        assertThat(rotated).hasSize(1);
        assertThat(otherInstance.isValid("old")).isFalse();
        assertThat(otherInstance.isValid(rotated.getFirst().getJti())).isTrue();
    }

    private boolean rotateAfterSignal(String newJti, CountDownLatch ready, CountDownLatch start)
            throws InterruptedException {
        ready.countDown();
        if (!start.await(2, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Concurrent rotation did not start");
        }
        return registry.rotate("old", newJti);
    }
}
