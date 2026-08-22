package com.evidencepilot.client.ai.gate;

import com.evidencepilot.service.AiModelClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * JVM-local backpressure complements the shared gate in the single-process model
 * service. The default 4-second interval starts at most about 15 calls/minute/JVM.
 * ponytail: replace the model-service gate with a distributed limiter before that
 * service runs in 2+ processes/instances. Add a circuit breaker if final 5xx or
 * transport failures exceed 50% of at least 20 calls in 5 minutes after client
 * retries; revisit that baseline with production metrics.
 */
@Component
public class AiModelCallGate {

    private final Semaphore aiRequestLimiter;
    private final long minIntervalNanos;
    private long nextAllowedNanos;

    public AiModelCallGate(Semaphore aiRequestLimiter) {
        this(aiRequestLimiter, 0);
    }

    @Autowired
    public AiModelCallGate(@Qualifier("aiRequestLimiter") Semaphore aiRequestLimiter,
            @Value("${ai.model.min-interval-ms:4000}") long minIntervalMillis) {
        this.aiRequestLimiter = aiRequestLimiter;
        this.minIntervalNanos = TimeUnit.MILLISECONDS.toNanos(Math.max(0, minIntervalMillis));
    }

    public <T> T execute(String endpoint, Supplier<T> call) {
        pace();
        try {
            if (!aiRequestLimiter.tryAcquire(5, TimeUnit.SECONDS)) {
                throw new AiModelClient.AiApiException(endpoint, 503,
                        "AI concurrency limit reached", null);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiModelClient.AiApiException(endpoint, 503,
                    "Interrupted while waiting for an AI slot", e);
        }
        try {
            return call.get();
        } finally {
            aiRequestLimiter.release();
        }
    }

    private synchronized void pace() {
        long now = System.nanoTime();
        long waitNanos = nextAllowedNanos - now;
        if (waitNanos > 0) {
            try {
                Thread.sleep(TimeUnit.NANOSECONDS.toMillis(waitNanos));
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        }
        nextAllowedNanos = Math.max(now, nextAllowedNanos) + minIntervalNanos;
    }
}
