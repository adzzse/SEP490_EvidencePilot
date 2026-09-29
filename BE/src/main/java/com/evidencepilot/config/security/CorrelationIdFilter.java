package com.evidencepilot.config.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * P0a: assigns or propagates a per-request correlation ID.
 *
 * <p>The ID is accepted from {@code X-Correlation-Id} (or {@code X-Request-Id}),
 * otherwise generated. It is exposed via MDC (server logs), the request
 * attribute, the {@code ApiErrorResponse.correlationId} field, and the response
 * header — so a browser-visible reference always maps to server-side diagnostics
 * without leaking upstream internals.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Correlation-Id";
    public static final String MDC_KEY = "correlationId";
    static final int MAX_LENGTH = 64;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String correlationId = sanitize(request.getHeader(HEADER));
        if (correlationId == null) correlationId = sanitize(request.getHeader("X-Request-Id"));
        if (correlationId == null) correlationId = UUID.randomUUID().toString();
        MDC.put(MDC_KEY, correlationId);
        request.setAttribute(MDC_KEY, correlationId);
        response.setHeader(HEADER, correlationId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }

    static String sanitize(String value) {
        if (value == null) return null;
        String clean = value.strip().replaceAll("[\\r\\n\\t]", "");
        return clean.isEmpty() || clean.length() > MAX_LENGTH ? null : clean;
    }

    /** Correlation ID for the current request; mints one when called outside a request. */
    public static String current() {
        String id = MDC.get(MDC_KEY);
        if (id != null) return id;
        id = UUID.randomUUID().toString();
        MDC.put(MDC_KEY, id);
        return id;
    }
}
