package com.evidencepilot.service;

import org.springframework.stereotype.Service;

@Service
public class TranslationService {

    /**
     * Lightweight translation — no AI generation involved.
     * Current implementation is pass-through (canonical English preserved).
     * Replace with external translation provider (e.g., Google/DeepL) when configured.
     */
    public String translate(String text, String targetLanguage) {
        if (text == null || text.isBlank()) return text == null ? "" : text;
        if (targetLanguage == null || targetLanguage.isBlank() || "en".equalsIgnoreCase(targetLanguage)) {
            return text;
        }
        // ponytail: stub — return original until provider wired; keeps AI canonical EN guarantee
        return text;
    }
}
