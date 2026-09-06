package com.evidencepilot.dto.response;

public record FeedbackAnchor(Target original, Projection current) {
    public record Target(String representation, String offsetUnit, Integer contentVersion,
                         String fingerprint, int from, int to, String exact, String prefix, String suffix) {}

    public record Projection(String status, Integer contentVersion, String fingerprint,
                             Integer from, Integer to) {}
}
