package com.evidencepilot.controller;

import com.evidencepilot.service.AiGenerationConfigService;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.CurrentUserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/admin/ai/configuration")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminAiConfigController {
    private final AiGenerationConfigService configService;
    private final AiModelClient aiModelClient;
    private final CurrentUserService currentUserService;

    public record UpdateRequest(@Min(0) long expectedRevision, @NotBlank String catalogFingerprint,
            @NotEmpty @Size(max = 3) List<@NotBlank @Size(max = 255) String> modelIds) {}

    public record ConfigurationResponse(Long revision, boolean persisted, String source, String provider,
            List<String> modelIds, String fingerprint, AiModelClient.GenerationCatalog catalog,
            String serviceStatus) {}

    @GetMapping
    public ConfigurationResponse get() {
        var stored = configService.configuration();
        try {
            AiModelClient.GenerationCatalog catalog = aiModelClient.generationCatalog();
            if (stored.isPresent()) {
                var value = stored.get();
                return response(value.selection(), true, value.source(), catalog,
                        configService.compatible(value.selection(), catalog) ? "AVAILABLE" : "OUT_OF_SYNC");
            }
            return response(configService.candidate(catalog, catalog.defaultModels()), false,
                    AiGenerationConfigService.SERVICE_DEFAULT, catalog, "AVAILABLE");
        } catch (AiModelClient.AiApiException unavailable) {
            if (stored.isEmpty()) return new ConfigurationResponse(null, false, null, null, List.of(),
                    null, null, "UNAVAILABLE");
            var value = stored.get();
            return response(value.selection(), true, value.source(), null, "UNAVAILABLE");
        }
    }

    @PutMapping
    public ConfigurationResponse update(@Valid @RequestBody UpdateRequest request) {
        AiModelClient.GenerationCatalog catalog = aiModelClient.generationCatalog();
        if (!catalog.catalogFingerprint().equals(request.catalogFingerprint())) {
            throw new AiGenerationConfigService.Conflict("GENERATION_CONFIG_CHANGED",
                    "AI service model catalog changed; reload and retry");
        }
        try {
            var updated = configService.update(catalog, request.modelIds(), request.expectedRevision(),
                    currentUserService.requireCurrentUser());
            return response(updated, true, AiGenerationConfigService.ADMIN, catalog, "AVAILABLE");
        } catch (IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, invalid.getMessage(), invalid);
        }
    }

    private ConfigurationResponse response(AiModelClient.GenerationSelection selection, boolean persisted,
            String source, AiModelClient.GenerationCatalog catalog, String serviceStatus) {
        return new ConfigurationResponse(selection.revision(), persisted, source, selection.provider(),
                selection.modelIds(), selection.fingerprint(), catalog, serviceStatus);
    }
}
