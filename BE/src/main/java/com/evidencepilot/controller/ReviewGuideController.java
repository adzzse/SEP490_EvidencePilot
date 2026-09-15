package com.evidencepilot.controller;

import com.evidencepilot.dto.response.ReviewGuideResponse;
import com.evidencepilot.service.impl.ReviewGuideServiceImpl;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/review-guides")
@RequiredArgsConstructor
@Tag(name = "Review Guides", description = "Read-only per-section-type review guidance")
public class ReviewGuideController {

    private final ReviewGuideServiceImpl reviewGuideService;

    @Operation(summary = "List active review guides",
            description = "Returns the global review-guide library (guidance + checklist) keyed by section type.")
    @GetMapping
    public List<ReviewGuideResponse> getActiveGuides() {
        return reviewGuideService.getActiveGuides();
    }
}
