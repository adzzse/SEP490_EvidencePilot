package com.evidencepilot.service;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DevBypassPolicyTest {
    @ParameterizedTest
    @CsvSource({
            "dev, true, local, true, false",
            "test, true, local, true, false",
            "dev, false, local, false, false",
            "test, false, local, false, false",
            "default, true, local, false, false",
            "production, true, local, false, true",
            "dev, true, production, false, true",
            "test, true, PRODUCTION, false, true",
            "dev+production, true, local, false, true"
    })
    void silentSeedRequiresExplicitLocalProfileAndFlag(
            String profiles, boolean enabled, String appEnv, boolean allowed, boolean production) {
        MockEnvironment environment = new MockEnvironment().withProperty("APP_ENV", appEnv);
        environment.setActiveProfiles(profiles.split("\\+"));
        DevBypassPolicy policy = new DevBypassPolicy(enabled, environment);

        assertThat(policy.isProduction()).isEqualTo(production);
        assertThat(policy.allowsSeedAccounts()).isEqualTo(allowed);
        if (allowed) {
            assertThatCode(policy::allowOrThrow).doesNotThrowAnyException();
        } else {
            assertThatThrownBy(policy::allowOrThrow).isInstanceOfSatisfying(
                    ResponseStatusException.class, ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        }
    }
}
