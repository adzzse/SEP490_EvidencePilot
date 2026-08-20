package com.evidencepilot.config.security;

import com.evidencepilot.model.Session;
import com.evidencepilot.repository.SessionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class JwtSessionRegistryPersistenceTest {

    @jakarta.annotation.Resource
    private SessionRepository sessions;

    @Test
    void startupRemovesExpiredSessionsOutsideCallerTransaction() {
        LocalDateTime now = LocalDateTime.now();
        sessions.save(new Session("expired", null, now.minusHours(2), now.minusHours(1)));
        sessions.save(new Session("active", null, now, now.plusHours(1)));

        JwtSessionRegistry registry = new JwtSessionRegistry(sessions, 60_000);
        registry.loadFromDatabase();

        assertThat(sessions.existsById("expired")).isFalse();
        assertThat(registry.isValid("expired")).isFalse();
        assertThat(registry.isValid("active")).isTrue();
    }
}
