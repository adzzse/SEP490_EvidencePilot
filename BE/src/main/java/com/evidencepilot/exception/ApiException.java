package com.evidencepilot.exception;

import org.springframework.http.HttpStatusCode;
import org.springframework.web.server.ResponseStatusException;

public final class ApiException extends ResponseStatusException {
    public static final String ACCOUNT_BANNED = "ACCOUNT_BANNED";
    public static final String PROJECT_MEMBERSHIP_REQUIRED = "PROJECT_MEMBERSHIP_REQUIRED";
    public static final String PROJECT_ROLE_REQUIRED = "PROJECT_ROLE_REQUIRED";
    public static final String PROJECT_TRANSITION_INVALID = "PROJECT_TRANSITION_INVALID";

    private final String code;

    public ApiException(HttpStatusCode status, String code, String message) {
        super(status, message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
