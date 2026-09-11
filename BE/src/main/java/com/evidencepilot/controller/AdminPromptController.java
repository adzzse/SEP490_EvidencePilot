package com.evidencepilot.controller;

import com.evidencepilot.model.PromptTemplate;
import com.evidencepilot.service.PromptTemplateService;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.AiGenerationConfigService;
import com.evidencepilot.service.SectionStandardService;
import com.evidencepilot.service.impl.SectionCitationReviewService;
import com.evidencepilot.dto.response.PromptTrialResponse;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/prompts")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@Tag(name = "Administration", description = "Versioned AI prompt registry")
public class AdminPromptController {

    private final PromptTemplateService service;
    private final AiModelClient aiModelClient;
    private final AiGenerationConfigService generationConfigService;
    private final SectionStandardService sectionStandardService;
    private final SectionCitationReviewService sectionCitationReviewService;

    public record CreateRequest(@NotBlank String template_key, @NotBlank String version, @NotBlank String system_text, String model) {}
    public record ActivateRequest(@JsonProperty("expectedActiveFingerprint") @NotBlank String expectedActiveFingerprint,
            @JsonProperty("expectedGenerationFingerprint") @NotBlank String expectedGenerationFingerprint) {}
    public record TrialRequest(@JsonProperty("template_key") @NotBlank String templateKey,
            @JsonProperty("template_id") UUID templateId,
            @JsonProperty("case_id") @NotBlank String caseId,
            @JsonProperty("model_ids") @NotEmpty @Size(max = 3) List<@NotBlank @Size(max = 255) String> modelIds,
            @JsonProperty("catalog_fingerprint") @NotBlank String catalogFingerprint) {}
    public record EffectiveResponse(@JsonProperty("template_key") String templateKey, UUID id, String version,
            String source, @JsonProperty("system_text") String systemText, String fingerprint,
            boolean configurationValid, List<String> configurationErrors) {}

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(required = false) String key) {
        return service.list(key).stream().map(this::toDto).toList();
    }

    @GetMapping("/defaults")
    public Map<String, String> defaults() {
        return service.defaults();
    }

    @GetMapping("/effective")
    public List<EffectiveResponse> effective() {
        return service.effective().stream().map(value -> new EffectiveResponse(
                value.templateKey(), value.id(), value.version(), value.source(), value.systemText(),
                value.fingerprint(), value.configurationValid(), value.configurationErrors())).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@Valid @RequestBody CreateRequest req) {
        return toDto(service.create(req.template_key(), req.version(), req.system_text(), req.model()));
    }

    @PostMapping("/{id}/validate")
    public Map<String, Object> validate(@PathVariable UUID id) {
        List<String> errors = service.validateConfiguration(id);
        return Map.of("id", id.toString(), "valid", errors.isEmpty(), "errors", errors,
                "validation_type", "CONFIGURATION", "runtime_verified", false);
    }

    @PostMapping("/{id}/activate")
    public Map<String, Object> activate(@PathVariable UUID id, @Valid @RequestBody ActivateRequest request) {
        aiModelClient.generationSelection();
        return toDto(service.activate(id, request.expectedActiveFingerprint(), request.expectedGenerationFingerprint()));
    }

    @PostMapping("/try")
    public PromptTrialResponse trial(@Valid @RequestBody TrialRequest request) {
        long started = System.nanoTime();
        AiModelClient.GenerationCatalog catalog = aiModelClient.generationCatalog();
        if (!catalog.catalogFingerprint().equals(request.catalogFingerprint())) {
            throw new AiGenerationConfigService.Conflict("GENERATION_CONFIG_CHANGED",
                    "AI service model catalog changed; reload and retry");
        }
        AiModelClient.GenerationSelection selection;
        try {
            selection = generationConfigService.candidate(catalog, request.modelIds());
        } catch (IllegalArgumentException invalid) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST, invalid.getMessage(), invalid);
        }
        PromptTemplateService.ResolvedPrompt prompt = request.templateId() == null
                ? service.resolve(request.templateKey()) : service.resolve(request.templateId());
        if (!prompt.key().equals(request.templateKey())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "template_id does not match template_key");
        }
        long elapsed = java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        long budget = 60_000 - elapsed;
        if (budget <= 0) {
            throw new AiModelClient.AiApiException("/api/admin/prompts/try", 503,
                    "GENERATION_DEADLINE_EXCEEDED", "GENERATION_DEADLINE_EXCEEDED", null, null);
        }
        return switch (request.templateKey()) {
            case "CHECK_STANDARD" -> sectionStandardService.trial(prompt, selection, request.caseId(), budget);
            case "CITATION_REVIEW" -> sectionCitationReviewService.trial(prompt, selection, request.caseId(), budget);
            default -> throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Unsupported template_key");
        };
    }

    private Map<String, Object> toDto(PromptTemplate t) {
        return Map.of(
                "id", t.getId().toString(),
                "template_key", t.getTemplateKey(),
                "version", t.getVersion(),
                "model", t.getModel() == null ? "" : t.getModel(),
                "active", t.isActive(),
                "system_text", t.getSystemText(),
                "createdAt", t.getCreatedAt() == null ? "" : t.getCreatedAt().toString());
    }
}
