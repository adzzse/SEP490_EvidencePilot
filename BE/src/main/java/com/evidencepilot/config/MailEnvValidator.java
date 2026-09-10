package com.evidencepilot.config;

import jakarta.annotation.PostConstruct;
import com.evidencepilot.service.DevBypassPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Fatal boot guard for external SMTP relay.
 * Checks the effective sender configuration whenever production policy applies.
 */
@Component
@RequiredArgsConstructor
public class MailEnvValidator {
    private final DevBypassPolicy policy;
    private final Environment environment;

    @PostConstruct
    void validate() {
        if (!policy.isProduction()) return;
        int port;
        try {
            port = Integer.parseInt(environment.getProperty("spring.mail.port", "587"));
        } catch (NumberFormatException ex) {
            port = 0;
        }
        if (port < 1 || port > 65535 || isBlank(environment.getProperty("spring.mail.host"))
                || isBlank(environment.getProperty("spring.mail.username"))
                || isBlank(environment.getProperty("spring.mail.password"))) {
            throw new IllegalStateException("Production requires spring.mail.host, port (1..65535), username and password");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
