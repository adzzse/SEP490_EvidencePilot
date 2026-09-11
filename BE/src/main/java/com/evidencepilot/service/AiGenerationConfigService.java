package com.evidencepilot.service;

import com.evidencepilot.model.AiGenerationConfig;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.AiGenerationConfigRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AiGenerationConfigService {
    public static final String SERVICE_DEFAULT = "SERVICE_DEFAULT";
    public static final String ADMIN = "ADMIN";

    private final AiGenerationConfigRepository repository;
    private final AuditService auditService;

    public record StoredSelection(String source, AiModelClient.GenerationSelection selection) {}

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public Optional<StoredSelection> configuration() {
        return repository.findById(1L).filter(this::initialized)
                .map(config -> new StoredSelection(config.getSource(), selection(config)));
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public Optional<AiModelClient.GenerationSelection> current() {
        return configuration().map(StoredSelection::selection);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public AiModelClient.GenerationSelection initialize(AiModelClient.GenerationCatalog catalog) {
        validateCatalog(catalog);
        AiGenerationConfig config = repository.lockCurrent()
                .orElseThrow(() -> new IllegalStateException("ai_generation_config singleton is missing"));
        if (!initialized(config)) {
            config.setSource(SERVICE_DEFAULT);
            config.setProvider(catalog.provider());
            config.setModelIds(catalog.defaultModels());
            config.setCatalogFingerprint(catalog.catalogFingerprint());
            config.setUpdatedAt(LocalDateTime.now());
            config = repository.saveAndFlush(config);
        }
        return selection(config);
    }

    public AiModelClient.GenerationSelection candidate(AiModelClient.GenerationCatalog catalog, List<String> modelIds) {
        validate(catalog, modelIds);
        return new AiModelClient.GenerationSelection(0, catalog.provider(), modelIds,
                catalog.catalogFingerprint(), fingerprint(catalog.provider(), catalog.catalogFingerprint(), modelIds));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public AiModelClient.GenerationSelection update(AiModelClient.GenerationCatalog catalog, List<String> modelIds,
            long expectedRevision, User actor) {
        validate(catalog, modelIds);
        AiGenerationConfig config = repository.lockCurrent()
                .orElseThrow(() -> new IllegalStateException("ai_generation_config singleton is missing"));
        if (config.getRevision() != expectedRevision) {
            throw new Conflict("AI_GENERATION_CONFIG_CONFLICT", "AI generation configuration changed; reload and retry");
        }
        AiModelClient.GenerationSelection before = initialized(config) ? selection(config) : null;
        AiModelClient.GenerationSelection requested = candidate(catalog, modelIds);
        if (before != null && before.fingerprint().equals(requested.fingerprint())) return before;

        config.setSource(ADMIN);
        config.setProvider(catalog.provider());
        config.setModelIds(modelIds);
        config.setCatalogFingerprint(catalog.catalogFingerprint());
        config.setUpdatedBy(actor);
        config.setUpdatedAt(LocalDateTime.now());
        config = repository.saveAndFlush(config);
        AiModelClient.GenerationSelection after = selection(config);
        auditService.record("AI_GENERATION_CONFIG_CHANGED", "AI_GENERATION_CONFIG", null, actor,
                auditValue(before), auditValue(after));
        return after;
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public boolean isCurrent(AiModelClient.GenerationSelection expected) {
        return repository.findById(1L).filter(this::initialized)
                .map(this::selection).map(value -> value.fingerprint().equals(expected.fingerprint())).orElse(false);
    }

    public boolean compatible(AiModelClient.GenerationSelection selection, AiModelClient.GenerationCatalog catalog) {
        return selection.provider().equals(catalog.provider())
                && selection.catalogFingerprint().equals(catalog.catalogFingerprint())
                && catalog.allowedModels().containsAll(selection.modelIds());
    }

    public Optional<AiModelClient.GenerationSelection> selectionOf(AiGenerationConfig config) {
        return Optional.ofNullable(config).filter(this::initialized).map(this::selection);
    }

    private void validate(AiModelClient.GenerationCatalog catalog, List<String> modelIds) {
        validateCatalog(catalog);
        if (modelIds == null || modelIds.isEmpty() || modelIds.size() > 3
                || modelIds.stream().distinct().count() != modelIds.size()
                || modelIds.stream().anyMatch(model -> model == null || model.isBlank() || model.length() > 255)
                || !catalog.allowedModels().containsAll(modelIds)) {
            throw new IllegalArgumentException("Select one to three distinct allowed models");
        }
    }

    private void validateCatalog(AiModelClient.GenerationCatalog catalog) {
        if (catalog == null || catalog.protocolVersion() != 1 || catalog.provider() == null
                || catalog.provider().isBlank() || catalog.allowedModels() == null
                || catalog.allowedModels().isEmpty() || catalog.allowedModels().size() > 3
                || catalog.allowedModels().stream().distinct().count() != catalog.allowedModels().size()
                || catalog.allowedModels().stream().anyMatch(model -> model == null || model.isBlank() || model.length() > 255)
                || catalog.defaultModels() == null || catalog.defaultModels().isEmpty()
                || !catalog.allowedModels().containsAll(catalog.defaultModels())
                || catalog.catalogFingerprint() == null || !catalog.catalogFingerprint().matches("[0-9a-f]{64}")
                || catalog.maxSystemChars() != PromptTemplateService.MAX_SYSTEM_CHARS
                || catalog.maxPromptChars() != 48000) {
            throw new IllegalArgumentException("AI service returned an incompatible generation catalog");
        }
    }

    private boolean initialized(AiGenerationConfig config) {
        return config.getSource() != null && config.getProvider() != null
                && config.getModelIds() != null && !config.getModelIds().isEmpty()
                && config.getCatalogFingerprint() != null;
    }

    private AiModelClient.GenerationSelection selection(AiGenerationConfig config) {
        return new AiModelClient.GenerationSelection(config.getRevision(), config.getProvider(), config.getModelIds(),
                config.getCatalogFingerprint(), fingerprint(config.getProvider(), config.getCatalogFingerprint(), config.getModelIds()));
    }

    private static String fingerprint(String provider, String catalogFingerprint, List<String> modelIds) {
        String serialized = "1:" + provider.length() + ":" + provider + ":" + catalogFingerprint
                + modelIds.stream().map(model -> ":" + model.length() + ":" + model).reduce("", String::concat);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(serialized.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static Map<String, Object> auditValue(AiModelClient.GenerationSelection value) {
        if (value == null) return Map.of();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("revision", value.revision());
        result.put("provider", value.provider());
        result.put("modelIds", value.modelIds());
        result.put("catalogFingerprint", value.catalogFingerprint());
        result.put("fingerprint", value.fingerprint());
        return result;
    }

    public static final class Conflict extends RuntimeException {
        private final String code;

        public Conflict(String code, String message) {
            super(message);
            this.code = code;
        }

        public String getCode() { return code; }
    }
}
