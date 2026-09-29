package com.evidencepilot.dto.response;

import com.evidencepilot.config.security.CorrelationIdFilter;

import java.time.LocalDateTime;
import java.util.Map;

public record ApiErrorResponse(
    LocalDateTime timestamp,
    int status,
    String error,
    String message,
    String code,
    String path,
    Map<String, String> fieldErrors,
    String correlationId
) {
    public static ApiErrorResponse of(int status, String error, String message, String path) {
        return of(status, error, message, null, path);
    }

    public static ApiErrorResponse of(int status, String error, String message, String code, String path) {
        return new ApiErrorResponse(LocalDateTime.now(), status, error, message, code, path, null,
                CorrelationIdFilter.current());
    }

    public static ApiErrorResponse validation(int status, String error, String message, String path,
                                              Map<String, String> fieldErrors) {
        return new ApiErrorResponse(LocalDateTime.now(), status, error, message, null, path, fieldErrors,
                CorrelationIdFilter.current());
    }
}
