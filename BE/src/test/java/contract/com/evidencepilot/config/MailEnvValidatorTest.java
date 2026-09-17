package com.evidencepilot.config;

import com.evidencepilot.config.infrastructure.DatabaseSeeder;
import com.evidencepilot.repository.ReviewGuideRepository;
import com.evidencepilot.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class MailEnvValidatorTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withBean(MailEnvValidator.class)
            .withBean(DatabaseSeeder.class)
            .withBean(UserRepository.class, () -> mock(UserRepository.class))
            .withBean(ReviewGuideRepository.class, () -> mock(ReviewGuideRepository.class))
            .withBean(PasswordEncoder.class, () -> mock(PasswordEncoder.class))
            .withBean(ObjectMapper.class, ObjectMapper::new);

    @Test
    void bootsWithBlankMail() {
        context.withPropertyValues("spring.mail.host=", "spring.mail.username=", "spring.mail.password=")
                .run(application -> {
                    assertThat(application).hasNotFailed();
                    application.getBean(DatabaseSeeder.class).run();
                    verify(application.getBean(ReviewGuideRepository.class), atLeastOnce()).save(any());
                });
    }

    @Test
    void bootsWithConfiguredMail() {
        context.withPropertyValues(
                "spring.mail.host=smtp.fixture.test", "spring.mail.port=587",
                "spring.mail.username=fixture", "spring.mail.password=" + java.util.UUID.randomUUID())
                .run(application -> {
                    assertThat(application).hasNotFailed();
                    application.getBean(DatabaseSeeder.class).run();
                    verify(application.getBean(ReviewGuideRepository.class), atLeastOnce()).save(any());
                });
    }

    @Test
    void invalidPortIsRejected() {
        context.withPropertyValues("spring.mail.host=smtp.fixture.test", "spring.mail.port=0")
                .run(application -> {
                    assertThat(application).hasFailed();
                    assertThat(application.getStartupFailure()).hasRootCauseMessage(
                            "spring.mail.port must be between 1 and 65535");
                });
    }
}
