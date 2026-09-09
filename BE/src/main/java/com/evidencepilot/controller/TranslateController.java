package com.evidencepilot.controller;

import com.evidencepilot.dto.request.TranslateRequest;
import com.evidencepilot.service.TranslationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/translate")
@RequiredArgsConstructor
public class TranslateController {

    private final TranslationService translationService;

    @PostMapping
    public ResponseEntity<Map<String, String>> translate(@Valid @RequestBody TranslateRequest request) {
        String translated = translationService.translate(request.text(), request.target_language());
        return ResponseEntity.ok(Map.of("translated_text", translated));
    }
}
