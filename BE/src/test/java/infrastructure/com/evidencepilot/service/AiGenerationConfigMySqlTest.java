package com.evidencepilot.service;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect"}, showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import(AiGenerationConfigService.class)
class AiGenerationConfigMySqlTest {
    @Container static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.46");
    private static final AiModelClient.GenerationCatalog CATALOG = new AiModelClient.GenerationCatalog(
            1, "remote", List.of("model-a", "model-b", "model-c"), List.of("model-a"),
            "a".repeat(64), 8000, 48000);

    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @Autowired AiGenerationConfigService service;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    @MockBean AuditService auditService;
    User actor;

    @BeforeEach void setUp() {
        jdbc.update("UPDATE ai_generation_config SET revision=0, source=NULL, provider=NULL, "
                + "model_ids_json=NULL, catalog_fingerprint=NULL, updated_by=NULL, updated_at=NULL WHERE id=1");
        actor = new User();
        actor.setEmail("ai-config-admin-" + UUID.randomUUID() + "@example.test");
        actor.setPasswordHash("fixture");
        actor.setRole(UserRole.ADMIN);
        actor.setAccountStatus(AccountStatus.ACTIVE);
        actor = users.saveAndFlush(actor);
    }

    @Test void concurrentInitializationKeepsOneServiceDefaultSelection() throws Exception {
        var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> { barrier.await(); return service.initialize(CATALOG); });
            var second = pool.submit(() -> { barrier.await(); return service.initialize(CATALOG); });
            assertThat(first.get(15, TimeUnit.SECONDS).fingerprint())
                    .isEqualTo(second.get(15, TimeUnit.SECONDS).fingerprint());
        }
        var stored = service.configuration().orElseThrow();
        assertThat(stored.source()).isEqualTo(AiGenerationConfigService.SERVICE_DEFAULT);
        assertThat(stored.selection().modelIds()).containsExactly("model-a");
    }

    @Test void sameRevisionAllowsOnlyOneCompetingAdminUpdate() throws Exception {
        long revision = service.initialize(CATALOG).revision();
        var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> updateAfter(barrier, revision, List.of("model-b")));
            var second = pool.submit(() -> updateAfter(barrier, revision, List.of("model-c")));
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("OK", "CONFLICT");
        }
        assertThat(service.current().orElseThrow().modelIds().get(0)).isIn("model-b", "model-c");
        verify(auditService, times(1)).record(
                org.mockito.ArgumentMatchers.eq("AI_GENERATION_CONFIG_CHANGED"),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.isNull(),
                org.mockito.ArgumentMatchers.eq(actor), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test void applyingIdenticalSelectionIsANoOp() {
        var before = service.initialize(CATALOG);
        clearInvocations(auditService);
        var after = service.update(CATALOG, before.modelIds(), before.revision(), actor);
        assertThat(after.revision()).isEqualTo(before.revision());
        verifyNoInteractions(auditService);
    }

    private String updateAfter(CyclicBarrier barrier, long revision, List<String> models) throws Exception {
        barrier.await(10, TimeUnit.SECONDS);
        try {
            service.update(CATALOG, models, revision, actor);
            return "OK";
        } catch (AiGenerationConfigService.Conflict conflict) {
            return "CONFLICT";
        }
    }
}
