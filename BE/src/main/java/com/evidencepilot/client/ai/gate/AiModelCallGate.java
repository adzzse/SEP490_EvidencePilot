package com.evidencepilot.client.ai.gate;

import com.evidencepilot.service.AiModelClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * Local backpressure plus database-backed concurrency, pacing, and circuit state.
 */
@Component
@Slf4j
public class AiModelCallGate {

    private static final long SLOT_WAIT_MILLIS = 5_000;
    private static final long SLOT_POLL_MILLIS = 100;

    private final Semaphore aiRequestLimiter;
    private final AiModelCallPolicy callPolicy;
    private final long minIntervalMillis;
    private final int maxConcurrentRequests;
    private final long leaseTimeoutMillis;
    private final long minIntervalNanos;
    private long nextAllowedNanos;

    public AiModelCallGate(Semaphore aiRequestLimiter) {
        this(aiRequestLimiter, null, 0, 1, 1);
    }

    public AiModelCallGate(Semaphore aiRequestLimiter, AiModelCallPolicy callPolicy) {
        this(aiRequestLimiter, callPolicy, 0, 4, 3_600_000);
    }

    @Autowired
    public AiModelCallGate(@Qualifier("aiRequestLimiter") Semaphore aiRequestLimiter,
            AiModelCallPolicy callPolicy,
            @Value("${ai.model.min-interval-ms:4000}") long minIntervalMillis,
            @Value("${ai.model.max-concurrent-requests:4}") int maxConcurrentRequests,
            @Value("${ai.model.lease-timeout-ms:3600000}") long leaseTimeoutMillis) {
        this.aiRequestLimiter = aiRequestLimiter;
        this.callPolicy = callPolicy;
        this.minIntervalMillis = Math.max(0, minIntervalMillis);
        this.maxConcurrentRequests = Math.max(1, maxConcurrentRequests);
        this.leaseTimeoutMillis = Math.max(1, leaseTimeoutMillis);
        this.minIntervalNanos = TimeUnit.MILLISECONDS.toNanos(Math.max(0, minIntervalMillis));
    }

    public <T> T execute(String endpoint, Supplier<T> call) {
        acquireLocal(endpoint);
        String leaseId = null;
        try {
            if (callPolicy == null) {
                paceLocally(endpoint);
            } else {
                try {
                    leaseId = acquireDistributed(endpoint);
                    waitFor(endpoint, callPolicy.reserveStart(minIntervalMillis));
                } catch (AiModelClient.AiApiException exception) {
                    throw exception;
                } catch (RuntimeException exception) {
                    throw new AiModelClient.AiApiException(
                            endpoint, 503, "AI distributed gate unavailable", exception);
                }
            }
            return call.get();
        } finally {
            if (leaseId != null) {
                try {
                    callPolicy.releaseLease(leaseId);
                } catch (RuntimeException exception) {
                    log.warn("Could not release AI model lease: {}",
                            exception.getClass().getSimpleName());
                }
            }
            aiRequestLimiter.release();
        }
    }

    public void checkCircuit(String endpoint) {
        if (callPolicy == null || "/health".equals(endpoint)) {
            return;
        }
        try {
            if (callPolicy.isCircuitOpen()) {
                throw new AiModelClient.AiApiException(
                        endpoint, 503, "AI model circuit is open", null);
            }
        } catch (AiModelClient.AiApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new AiModelClient.AiApiException(
                    endpoint, 503, "AI circuit state unavailable", exception);
        }
    }

    public void recordFinalOutcome(String endpoint, boolean breakerFailure) {
        if (callPolicy == null || "/health".equals(endpoint)) {
            return;
        }
        try {
            callPolicy.recordFinalOutcome(breakerFailure);
        } catch (RuntimeException exception) {
            log.warn("Could not record AI model outcome: {}",
                    exception.getClass().getSimpleName());
        }
    }

    private void acquireLocal(String endpoint) {
        try {
            if (!aiRequestLimiter.tryAcquire(SLOT_WAIT_MILLIS, TimeUnit.MILLISECONDS)) {
                throw new AiModelClient.AiApiException(endpoint, 503,
                        "AI concurrency limit reached", null);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AiModelClient.AiApiException(endpoint, 503,
                    "Interrupted while waiting for an AI slot", exception);
        }
    }

    private String acquireDistributed(String endpoint) {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(SLOT_WAIT_MILLIS);
        while (true) {
            String leaseId = callPolicy.tryAcquireLease(
                    maxConcurrentRequests, leaseTimeoutMillis);
            if (leaseId != null) {
                return leaseId;
            }
            long remainingNanos = deadline - System.nanoTime();
            if (remainingNanos <= 0) {
                throw new AiModelClient.AiApiException(endpoint, 503,
                        "AI distributed concurrency limit reached", null);
            }
            waitFor(endpoint, Math.min(
                    SLOT_POLL_MILLIS,
                    TimeUnit.NANOSECONDS.toMillis(remainingNanos)));
        }
    }

    private synchronized void paceLocally(String endpoint) {
        long now = System.nanoTime();
        long waitNanos = nextAllowedNanos - now;
        if (waitNanos > 0) {
            waitFor(endpoint, TimeUnit.NANOSECONDS.toMillis(waitNanos));
        }
        nextAllowedNanos = Math.max(now, nextAllowedNanos) + minIntervalNanos;
    }

    private static void waitFor(String endpoint, long millis) {
        if (millis <= 0) {
            return;
        }
        try {
            Thread.sleep(millis);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AiModelClient.AiApiException(
                    endpoint, 503, "Interrupted while waiting for an AI slot", exception);
        }
    }
}
