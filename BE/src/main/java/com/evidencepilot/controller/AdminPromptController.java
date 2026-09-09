package com.evidencepilot.controller;

import com.evidencepilot.model.PromptTemplate;
import com.evidencepilot.service.PromptTemplateService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
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

    public record CreateRequest(@NotBlank String template_key, @NotBlank String version, @NotBlank String system_text, String model) {}

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(required = false) String key) {
        return service.list(key).stream().map(this::toDto).toList();
    }

    @GetMapping("/defaults")
    public Map<String, String> defaults() {
        return service.defaults();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@Valid @RequestBody CreateRequest req) {
        return toDto(service.create(req.template_key(), req.version(), req.system_text(), req.model()));
    }

    @PostMapping("/{id}/validate")
    public Map<String, Object> validate(@PathVariable UUID id) {
        List<String> errors = service.validateDryRun(id);
        return Map.of("id", id.toString(), "valid", errors.isEmpty(), "errors", errors);
    }

    @PostMapping("/{id}/activate")
    public Map<String, Object> activate(@PathVariable UUID id) {
        return toDto(service.activate(id));
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
