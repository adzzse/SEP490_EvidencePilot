package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record FeedbackAnchorRequest(
        @NotNull @PositiveOrZero Integer from,
        @NotNull @PositiveOrZero Integer to,
        @NotNull Integer contentVersion,
        @NotBlank String fingerprint,
        @NotBlank String representation,
        @NotBlank String offsetUnit) {}
