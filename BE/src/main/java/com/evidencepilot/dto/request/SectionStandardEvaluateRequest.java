package com.evidencepilot.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record SectionStandardEvaluateRequest(
        @NotEmpty
        @Size(max = 15, message = "Cannot exceed 15 requirements")
        List<@NotBlank @Size(max = 250, message = "Requirement text too long") String> requirements,
        @Min(0) @Max(100) Integer passThreshold
) {}
