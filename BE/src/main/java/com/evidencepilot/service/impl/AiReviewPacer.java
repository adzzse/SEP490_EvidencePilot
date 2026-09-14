package com.evidencepilot.service.impl;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Client-side token bucket pacing remote AI calls.
 *
 * <p>The Python AI service sits behind a throttled tunnel (~20 req/min).
 * Bursting concurrent reviews into it produces 429s with 60 s floors, which
 * cost more throughput than pacing saves. This gate spreads remote calls
 * evenly; local work (Qdrant, Postgres) is never gated.
 *
 * <p>A rate of {@code <= 0} disables pacing (used in unit tests).
 */
@Service
@Slf4j
public class AiReviewPacer {

    private final int permitsPerMinute;
    private long availableTokens;
    private long lastRefillNanos;
    private final Object monitor = new Object();

    public AiReviewPacer(
            @Value("${ai.review.remote-rate-per-minute:18}") int permitsPerMinute) {
        this.permitsPerMinute = permitsPerMinute;
        this.availableTokens = Math.max(0, permitsPerMinute);
        this.lastRefillNanos = System.nanoTime();
    }

    public void acquire() {
        if (permitsPerMinute <= 0) {
            return;
        }
        long waitMillis = takeToken();
        while (waitMillis > 0) {
            try {
                Thread.sleep(Math.min(waitMillis, 50));
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return;
            }
            waitMillis = takeToken();
        }
    }

    private long takeToken() {
        synchronized (monitor) {
            long now = System.nanoTime();
            long elapsedNanos = now - lastRefillNanos;
            long refill = elapsedNanos * permitsPerMinute / 60_000_000_000L;
            if (refill > 0) {
                availableTokens = Math.min(permitsPerMinute, availableTokens + refill);
                lastRefillNanos = now;
            }
            if (availableTokens > 0) {
                availableTokens--;
                return 0;
            }
            long nanosPerPermit = 60_000_000_000L / permitsPerMinute;
            long nextAvailable = lastRefillNanos + nanosPerPermit - now;
            if (log.isDebugEnabled()) {
                log.debug("AI review pacer delaying remote call by ~{}ms", nextAvailable / 1_000_000);
            }
            return Math.max(1, nextAvailable / 1_000_000);
        }
    }
}
