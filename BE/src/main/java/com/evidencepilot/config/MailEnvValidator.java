package com.evidencepilot.config;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Boot guard for external SMTP relay.
 * Validates mail configuration at startup when mail properties are present.
 */
@Component
@RequiredArgsConstructor
public class MailEnvValidator {
    private final Environment environment;

    @PostConstruct
    void validate() {
        // No production gate — mail config is always optional.
        // If mail properties are present, validate them.
        String host = environment.getProperty("spring.mail.host");
        if (isBlank(host)) return; // No mail configured — skip

        int port;
        try {
            port = Integer.parseInt(environment.getProperty("spring.mail.port", "587"));
        } catch (NumberFormatException ex) {
            port = 0;
        }
        if (port < 1 || port > 65535) {
            throw new IllegalStateException("spring.mail.port must be between 1 and 65535");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
