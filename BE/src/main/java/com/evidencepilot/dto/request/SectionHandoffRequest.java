package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record SectionHandoffRequest(
        @NotBlank
        @Pattern(regexp = "[0-9a-f]{64}", message = "expectedInputFingerprint must be a SHA-256 fingerprint")
        String expectedInputFingerprint
) {}
