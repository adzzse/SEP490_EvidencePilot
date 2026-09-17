package com.evidencepilot.service.impl;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AiReviewPacerTest {

    @Test
    void disabledPacerNeverBlocks() {
        AiReviewPacer pacer = new AiReviewPacer(0);
        long started = System.nanoTime();
        for (int i = 0; i < 100; i++) {
            pacer.acquire();
        }
        assertThat(java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started))
                .isLessThan(1000);
    }

    @Test
    void burstUpToConfiguredRateIsImmediate() {
        AiReviewPacer pacer = new AiReviewPacer(3600);
        long started = System.nanoTime();
        for (int i = 0; i < 10; i++) {
            pacer.acquire();
        }
        assertThat(java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started))
                .isLessThan(2000);
    }

    @Test
    void overflowWaitsForRefill() {
        // 120/min = 1 token per 500ms; the 3rd acquire must wait.
        AiReviewPacer pacer = new AiReviewPacer(120);
        for (int i = 0; i < 120; i++) {
            pacer.acquire();
        }
        long started = System.nanoTime();
        pacer.acquire();
        long waited = java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        assertThat(waited).isGreaterThanOrEqualTo(200);
    }
}
