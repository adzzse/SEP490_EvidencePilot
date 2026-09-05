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
 * Separate local capacity and database-backed generation concurrency/circuit state.
 */
@Component
@Slf4j
public class AiModelCallGate {

    private static final long SLOT_WAIT_MILLIS = 5_000;
    private static final long SLOT_POLL_MILLIS = 100;

    private final Semaphore aiRequestLimiter;
    private final Semaphore generationLimiter;
    private final AiModelCallPolicy callPolicy;
    private final int maxConcurrentRequests;
    private final long leaseTimeoutMillis;

    public AiModelCallGate(Semaphore aiRequestLimiter) {
        this(aiRequestLimiter, null, 4, 3_600_000);
    }

    public AiModelCallGate(Semaphore aiRequestLimiter, AiModelCallPolicy callPolicy) {
        this(aiRequestLimiter, callPolicy, 4, 3_600_000);
    }

    @Autowired
    public AiModelCallGate(@Qualifier("aiRequestLimiter") Semaphore aiRequestLimiter,
            AiModelCallPolicy callPolicy,
            @Value("${ai.model.max-concurrent-requests:4}") int maxConcurrentRequests,
            @Value("${ai.model.lease-timeout-ms:3600000}") long leaseTimeoutMillis) {
        this.aiRequestLimiter = aiRequestLimiter;
        this.generationLimiter = new Semaphore(Math.max(1, maxConcurrentRequests));
        this.callPolicy = callPolicy;
        this.maxConcurrentRequests = Math.max(1, maxConcurrentRequests);
        this.leaseTimeoutMillis = Math.max(1, leaseTimeoutMillis);
    }

    public <T> T execute(String endpoint, Supplier<T> call) {
        return execute(endpoint, System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(SLOT_WAIT_MILLIS), call);
    }

    public <T> T execute(String endpoint, long deadline, Supplier<T> call) {
        if ("/health".equals(endpoint)) return call.get();
        boolean generation = "/ai/generate".equals(endpoint);
        Semaphore limiter = generation ? generationLimiter : aiRequestLimiter;
        acquireLocal(endpoint, limiter, deadline);
        String leaseId = null;
        try {
            if (generation && callPolicy != null) {
                try {
                    leaseId = acquireDistributed(endpoint, deadline);
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
            limiter.release();
        }
    }

    public void checkCircuit(String endpoint) {
        if (callPolicy == null || !"/ai/generate".equals(endpoint)) {
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
        if (callPolicy == null || !"/ai/generate".equals(endpoint)) {
            return;
        }
        try {
            callPolicy.recordFinalOutcome(breakerFailure);
        } catch (RuntimeException exception) {
            log.warn("Could not record AI model outcome: {}",
                    exception.getClass().getSimpleName());
        }
    }

    private void acquireLocal(String endpoint, Semaphore limiter, long deadline) {
        try {
            long waitNanos = Math.min(TimeUnit.MILLISECONDS.toNanos(SLOT_WAIT_MILLIS),
                    Math.max(0, deadline - System.nanoTime()));
            if (waitNanos == 0 || !limiter.tryAcquire(waitNanos, TimeUnit.NANOSECONDS)) {
                throw new AiModelClient.AiApiException(endpoint, 503,
                        "AI concurrency limit reached", null);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AiModelClient.AiApiException(endpoint, 503,
                    "Interrupted while waiting for an AI slot", exception);
        }
    }

    private String acquireDistributed(String endpoint, long batchDeadline) {
        long deadline = Math.min(batchDeadline,
                System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(SLOT_WAIT_MILLIS));
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
