package com.evidencepilot.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Explicit local/test user-creation bypass. Production always takes precedence.
 */
@Component
public class DevBypassPolicy {

    /** Fixed local-dev password. Server-side only — must never reach the FE. */
    public static final String FIXED_PASSWORD = "Evidence123!";

    private final boolean enabled;
    private final Environment environment;

    public DevBypassPolicy(@Value("${app.dev-bypass.enabled:false}") boolean enabled, Environment environment) {
        this.enabled = enabled;
        this.environment = environment;
    }

    public boolean isProduction() {
        return environment.matchesProfiles("production")
                || "production".equalsIgnoreCase(environment.getProperty("APP_ENV", "").trim());
    }

    public boolean allowsSeedAccounts() {
        return enabled && !isProduction() && environment.matchesProfiles("dev", "test");
    }

    public void allowOrThrow() {
        if (!allowsSeedAccounts()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Silent seed requires enabled dev/test bypass");
        }
    }
}
