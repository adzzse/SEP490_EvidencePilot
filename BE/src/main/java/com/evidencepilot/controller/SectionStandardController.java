package com.evidencepilot.controller;

import com.evidencepilot.dto.request.SectionStandardEvaluateRequest;
import com.evidencepilot.dto.response.SectionStandardEvaluationResponse;
import com.evidencepilot.service.SectionStandardService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/papers/{documentId}/sections/{sectionId}/standard-evaluation")
@RequiredArgsConstructor
public class SectionStandardController {

    private final SectionStandardService sectionStandardService;

    @PostMapping
    public ResponseEntity<SectionStandardEvaluationResponse> evaluate(
            @PathVariable UUID documentId,
            @PathVariable UUID sectionId,
            @Valid @RequestBody SectionStandardEvaluateRequest request) {
        var res = sectionStandardService.evaluate(documentId, sectionId,
                request.requirements(), request.passThreshold() == null ? 70 : request.passThreshold());
        return ResponseEntity.ok(res);
    }

    @PutMapping("/config")
    public ResponseEntity<SectionStandardEvaluationResponse> saveConfig(
            @PathVariable UUID documentId,
            @PathVariable UUID sectionId,
            @Valid @RequestBody SectionStandardEvaluateRequest request) {
        var res = sectionStandardService.saveConfig(documentId, sectionId,
                request.requirements(), request.passThreshold() == null ? 70 : request.passThreshold());
        return ResponseEntity.ok(res);
    }

    @GetMapping
    public ResponseEntity<SectionStandardEvaluationResponse> latest(
            @PathVariable UUID documentId,
            @PathVariable UUID sectionId) {
        return sectionStandardService.latest(sectionId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }
}
