package com.evidencepilot.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Fatal boot guard for external SMTP relay.
 * In the production profile, MAIL_HOST / MAIL_PORT / MAIL_USERNAME / MAIL_PASSWORD
 * must be provided via strict environment variables. Missing values throw on boot.
 */
@Component
@Profile("production")
public class MailEnvValidator {

    @Value("${MAIL_HOST:}")
    private String mailHost;

    @Value("${MAIL_PORT:}")
    private String mailPort;

    @Value("${MAIL_USERNAME:}")
    private String mailUsername;

    @Value("${MAIL_PASSWORD:}")
    private String mailPassword;

    @PostConstruct
    void validate() {
        if (isBlank(mailHost) || isBlank(mailPort) || isBlank(mailUsername) || isBlank(mailPassword)) {
            throw new IllegalStateException(
                    "Mail configuration missing in production profile. "
                            + "Required env vars: MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
