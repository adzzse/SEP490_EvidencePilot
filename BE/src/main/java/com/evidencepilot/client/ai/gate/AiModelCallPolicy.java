package com.evidencepilot.client.ai.gate;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Component
public class AiModelCallPolicy {

    private static final String GATE_KEY = "model";
    private static final Duration CIRCUIT_WINDOW = Duration.ofMinutes(5);
    private static final int CIRCUIT_MINIMUM_CALLS = 20;
    private static final int CIRCUIT_FAILURE_PERCENT = 50;

    private final JdbcTemplate jdbcTemplate;

    public AiModelCallPolicy(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long reserveStart(long minIntervalMillis) {
        Timestamp nextAllowed = lockGate();
        Timestamp now = databaseNow();
        Instant scheduled = nextAllowed.toInstant().isAfter(now.toInstant())
                ? nextAllowed.toInstant() : now.toInstant();
        int updated = jdbcTemplate.update(
                "UPDATE ai_model_gate_state SET next_allowed_at = ? WHERE gate_key = ?",
                Timestamp.from(scheduled.plusMillis(Math.max(0, minIntervalMillis))),
                GATE_KEY);
        if (updated != 1) {
            throw new IllegalStateException("AI model gate state is missing");
        }
        long waitNanos = Duration.between(now.toInstant(), scheduled).toNanos();
        return waitNanos <= 0 ? 0 : (waitNanos + 999_999) / 1_000_000;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String tryAcquireLease(int maxConcurrent, long leaseTimeoutMillis) {
        lockGate();
        Timestamp now = databaseNow();
        jdbcTemplate.update(
                "DELETE FROM ai_model_call_leases WHERE expires_at <= ?", now);
        Long active = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ai_model_call_leases", Long.class);
        if (active != null && active >= Math.max(1, maxConcurrent)) {
            return null;
        }
        String leaseId = UUID.randomUUID().toString();
        jdbcTemplate.update(
                "INSERT INTO ai_model_call_leases (lease_id, expires_at) VALUES (?, ?)",
                leaseId,
                Timestamp.from(now.toInstant().plusMillis(Math.max(1, leaseTimeoutMillis))));
        return leaseId;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void releaseLease(String leaseId) {
        jdbcTemplate.update(
                "DELETE FROM ai_model_call_leases WHERE lease_id = ?", leaseId);
    }

    @Transactional(readOnly = true)
    public boolean isCircuitOpen() {
        Timestamp cutoff = Timestamp.from(databaseNow().toInstant().minus(CIRCUIT_WINDOW));
        CircuitWindow window = jdbcTemplate.queryForObject("""
                        SELECT COUNT(*),
                               COALESCE(SUM(CASE WHEN breaker_failure = TRUE THEN 1 ELSE 0 END), 0)
                        FROM ai_model_call_outcomes
                        WHERE occurred_at >= ?
                        """,
                (result, row) -> new CircuitWindow(result.getLong(1), result.getLong(2)),
                cutoff);
        return window != null
                && window.calls() >= CIRCUIT_MINIMUM_CALLS
                && window.failures() * 100 > window.calls() * CIRCUIT_FAILURE_PERCENT;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFinalOutcome(boolean breakerFailure) {
        Timestamp now = databaseNow();
        jdbcTemplate.update("""
                        INSERT INTO ai_model_call_outcomes (breaker_failure, occurred_at)
                        VALUES (?, ?)
                        """,
                breakerFailure,
                now);
        jdbcTemplate.update(
                "DELETE FROM ai_model_call_outcomes WHERE occurred_at < ?",
                Timestamp.from(now.toInstant().minus(CIRCUIT_WINDOW)));
    }

    private Timestamp lockGate() {
        return jdbcTemplate.queryForObject(
                "SELECT next_allowed_at FROM ai_model_gate_state WHERE gate_key = ? FOR UPDATE",
                Timestamp.class,
                GATE_KEY);
    }

    private Timestamp databaseNow() {
        Timestamp now = jdbcTemplate.queryForObject("SELECT CURRENT_TIMESTAMP", Timestamp.class);
        if (now == null) {
            throw new IllegalStateException("Database clock is unavailable");
        }
        return now;
    }

    private record CircuitWindow(long calls, long failures) {
    }
}
