package com.evidencepilot.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Quarantined dev-only user-creation bypass: fixed password, no email sent.
 * <p>
 * The bean only exists under the {@code dev} Spring profile, and the bypass
 * additionally requires {@code app.dev-bypass.enabled=true}. Both gates must
 * pass — the flag alone can never enable the bypass in production, and the
 * fixed password lives server-side only, never in a frontend bundle.
 */
@Component
@Profile("dev")
public class DevBypassPolicy {

    /** Fixed local-dev password. Server-side only — must never reach the FE. */
    public static final String FIXED_PASSWORD = "Evidence123!";

    private final boolean enabled;

    public DevBypassPolicy(@Value("${app.dev-bypass.enabled:false}") boolean enabled) {
        this.enabled = enabled;
    }

    public void allowOrThrow() {
        if (!enabled) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Dev bypass is not enabled");
        }
    }
}
