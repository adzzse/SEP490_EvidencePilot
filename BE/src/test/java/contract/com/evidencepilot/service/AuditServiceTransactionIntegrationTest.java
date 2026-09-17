package com.evidencepilot.service;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.AuditLogRepository;
import com.evidencepilot.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@Import({AuditService.class, AuditServiceTransactionIntegrationTest.JsonConfig.class})
class AuditServiceTransactionIntegrationTest {

    @jakarta.annotation.Resource AuditService audit;
    @jakarta.annotation.Resource AuditLogRepository auditLogs;
    @jakarta.annotation.Resource UserRepository users;
    @jakarta.annotation.Resource PlatformTransactionManager transactions;

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void auditJoinsAndRollsBackWithCallerTransaction() {
        User actor = saveActor();
        User savedActor = actor;

        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
            audit.record("TEST", "USER", UUID.randomUUID(), savedActor, null, Map.of("safe", true));
            throw new IllegalStateException("rollback");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(auditLogs.count()).isZero();
    }

    @Test
    void broadcastAuditAllowsNullEntityId() {
        User actor = saveActor();

        audit.record("NOTIFICATION_BROADCAST", "SYSTEM_NOTIFICATION", null, actor, null,
                Map.of("recipientCount", 2));
        auditLogs.flush();

        assertThat(auditLogs.findAll()).singleElement().satisfies(log -> {
            assertThat(log.getEntityId()).isNull();
            assertThat(log.getNewValue()).contains("recipientCount");
        });
    }

    private User saveActor() {
        User actor = new User();
        actor.setEmail("audit-" + UUID.randomUUID() + "@test.com");
        actor.setPasswordHash("hash");
        actor.setRole(UserRole.ADMIN);
        actor.setAccountStatus(AccountStatus.ACTIVE);
        return users.save(actor);
    }

    @TestConfiguration
    static class JsonConfig {
        @Bean ObjectMapper objectMapper() {
            return new ObjectMapper();
        }
    }
}
