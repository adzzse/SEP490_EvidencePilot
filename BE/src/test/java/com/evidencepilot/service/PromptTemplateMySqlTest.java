package com.evidencepilot.service;

import com.evidencepilot.model.PromptTemplate;
import com.evidencepilot.repository.PromptTemplateRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;

@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect"}, showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import({PromptTemplateService.class, AiGenerationConfigService.class})
class PromptTemplateMySqlTest {
    @Container static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.46");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }
    @Autowired PromptTemplateService service;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    @Autowired AiGenerationConfigService generationConfig;
    @SpyBean PromptTemplateRepository repository;
    @MockBean CurrentUserService users;
    @MockBean AuditService auditService;

    @org.junit.jupiter.api.BeforeEach
    void initializeGeneration() {
        generationConfig.initialize(new AiModelClient.GenerationCatalog(1, "remote",
                List.of("model-a", "model-b"), List.of("model-a"), "a".repeat(64), 8000, 48000));
        var actor = new com.evidencepilot.model.User();
        actor.setId(UUID.randomUUID());
        actor.setEmail("prompt-test-" + actor.getId() + "@example.test");
        jdbc.update("INSERT INTO users (id, email, password_hash, role, account_status) VALUES (UUID_TO_BIN(?), ?, 'hash', 'ADMIN', 'ACTIVE')",
                actor.getId().toString(), actor.getEmail());
        org.mockito.Mockito.when(users.requireCurrentUser()).thenReturn(actor);
    }

    @Test void concurrentActivationsLeaveExactlyOneActiveVersion() throws Exception {
        var first = draft("CHECK_STANDARD");
        var second = draft("CHECK_STANDARD");
        var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var outcomes = List.of(first, second).stream().map(target -> pool.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                try {
                    activate(target);
                    return 200;
                } catch (ResponseStatusException exception) {
                    return exception.getStatusCode().value();
                } catch (AiGenerationConfigService.Conflict exception) {
                    return 409;
                }
            })).toList();
            for (var outcome : outcomes) assertThat(outcome.get(20, TimeUnit.SECONDS)).isIn(200, 409);
        }
        assertThat(activeCount("CHECK_STANDARD")).isOne();
        assertThat(service.resolve("CHECK_STANDARD").version()).isIn(first.getVersion(), second.getVersion());
    }

    @Test void failureAfterSiblingDeactivationRollsBackAndPreservesPreviousActive() {
        var previous = draft("CHECK_STANDARD");
        activate(previous);
        var candidate = draft("CHECK_STANDARD");
        doAnswer(call -> {
            assertThat(activeCount("CHECK_STANDARD")).isZero();
            throw new DataIntegrityViolationException("Injected activation failure");
        })
                .when(repository).saveAndFlush(argThat(template -> candidate.getId().equals(template.getId())));
        assertThatThrownBy(() -> activate(candidate))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(409));
        assertThat(activeCount("CHECK_STANDARD")).isOne();
        assertThat(service.resolve("CHECK_STANDARD").version()).isEqualTo(previous.getVersion());
        assertThat(repository.findById(candidate.getId()).orElseThrow().isActive()).isFalse();
    }

    @Test void differentPromptKeysRemainIndependentAndDuplicateVersionsConflict() {
        var check = draft("CHECK_STANDARD");
        var citation = draft("CITATION_REVIEW");
        activate(check);
        activate(citation);
        assertThat(service.resolve("CHECK_STANDARD").version()).isEqualTo(check.getVersion());
        assertThat(service.resolve("CITATION_REVIEW").version()).isEqualTo(citation.getVersion());
        assertThatThrownBy(() -> service.create(check.getTemplateKey(), check.getVersion(), check.getSystemText(), null))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(409));
    }

    @Test void resolverSeesActivationCommittedDuringAnExistingCallerTransaction() {
        var before = draft("CHECK_STANDARD");
        var after = draft("CHECK_STANDARD");
        activate(before);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            assertThat(repository.findByTemplateKeyAndActiveTrue("CHECK_STANDARD").orElseThrow().getVersion()).isEqualTo(before.getVersion());
            assertThat(service.resolve("CHECK_STANDARD").version()).isEqualTo(before.getVersion());
            try (var pool = Executors.newSingleThreadExecutor()) {
                pool.submit(() -> activate(after)).get(15, TimeUnit.SECONDS);
            } catch (Exception exception) {
                throw new AssertionError(exception);
            }
            assertThat(service.resolve("CHECK_STANDARD").version()).isEqualTo(after.getVersion());
        });
    }

    private PromptTemplate draft(String key) {
        return service.create(key, UUID.randomUUID().toString(), service.defaults().get(key), "display-only");
    }

    private PromptTemplate activate(PromptTemplate template) {
        var effective = service.effective().stream()
                .filter(value -> value.templateKey().equals(template.getTemplateKey())).findFirst().orElseThrow();
        var generation = generationConfig.current().orElseThrow();
        return service.activate(template.getId(), effective.fingerprint(), generation.fingerprint());
    }

    private int activeCount(String key) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM prompt_templates WHERE template_key=? AND active=TRUE", Integer.class, key);
    }
}
