package com.evidencepilot.exception;

import lombok.Getter;

import java.util.Map;

@Getter
public class SubmissionReadinessException extends RuntimeException {
    private final String code;
    private final Map<String, String> details;

    public SubmissionReadinessException(String code, String message) {
        this(code, message, Map.of());
    }

    public SubmissionReadinessException(
            String code, String message, Map<String, String> details) {
        super(message);
        this.code = code;
        this.details = Map.copyOf(details);
    }
}
