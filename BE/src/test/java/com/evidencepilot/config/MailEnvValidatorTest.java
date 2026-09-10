package com.evidencepilot.config;

import com.evidencepilot.config.infrastructure.DatabaseSeeder;
import com.evidencepilot.repository.ReviewGuideRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.DevBypassPolicy;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class MailEnvValidatorTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withBean(DevBypassPolicy.class)
            .withBean(MailEnvValidator.class)
            .withBean(DatabaseSeeder.class)
            .withBean(UserRepository.class, () -> mock(UserRepository.class))
            .withBean(ReviewGuideRepository.class, () -> mock(ReviewGuideRepository.class))
            .withBean(PasswordEncoder.class, () -> mock(PasswordEncoder.class))
            .withBean(ObjectMapper.class, ObjectMapper::new);

    @ParameterizedTest
    @ValueSource(strings = {"spring.profiles.active=production", "APP_ENV=production"})
    void productionWithEffectiveMailPropertiesBootsWithoutDemoUsers(String productionProperty) {
        context.withPropertyValues(productionProperty, "app.dev-bypass.enabled=true",
                "spring.mail.host=smtp.fixture.test", "spring.mail.port=587",
                "spring.mail.username=fixture", "spring.mail.password=" + java.util.UUID.randomUUID())
                .run(application -> {
                    assertThat(application).hasNotFailed();
                    application.getBean(DatabaseSeeder.class).run();
                    verifyNoInteractions(application.getBean(UserRepository.class));
                    verify(application.getBean(ReviewGuideRepository.class), atLeastOnce()).save(any());
                });
    }

    @Test
    void missingProductionMailFailsWithSanitizedReason() {
        context.withPropertyValues("APP_ENV=production").run(application -> {
            assertThat(application).hasFailed();
            assertThat(application.getStartupFailure()).hasRootCauseMessage(
                    "Production requires spring.mail.host, port (1..65535), username and password");
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "0", "65536", "invalid"})
    void invalidProductionPortIsRejected(String port) {
        context.withPropertyValues("spring.profiles.active=dev,production", "spring.mail.port=" + port,
                "spring.mail.host=smtp.fixture.test", "spring.mail.username=fixture",
                "spring.mail.password=" + java.util.UUID.randomUUID()).run(application -> {
                    assertThat(application).hasFailed();
                    assertThat(application.getStartupFailure()).hasRootCauseMessage(
                            "Production requires spring.mail.host, port (1..65535), username and password");
                });
    }

    @Test
    void devWithBlankMailBoots() {
        context.withPropertyValues("spring.profiles.active=dev", "spring.mail.host=",
                "spring.mail.username=", "spring.mail.password=").run(application -> {
                    assertThat(application).hasNotFailed();
                    application.getBean(DatabaseSeeder.class).run();
                    verifyNoInteractions(application.getBean(UserRepository.class));
                });
    }
}
