package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TranslateRequest(
        @NotBlank @Size(max = 4000) String text,
        @NotBlank @Size(max = 10) String target_language) {
}
