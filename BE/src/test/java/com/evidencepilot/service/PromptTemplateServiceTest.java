package com.evidencepilot.service;

import com.evidencepilot.model.PromptTemplate;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.PromptTemplateRepository;
import com.evidencepilot.repository.AiGenerationConfigRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.IncorrectResultSizeDataAccessException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PromptTemplateServiceTest {
    @Mock PromptTemplateRepository repository;
    @Mock CurrentUserService users;
    @Mock PlatformTransactionManager transactions;
    @Mock AiGenerationConfigRepository generationConfigRepository;
    @Mock AiGenerationConfigService generationConfigService;
    @Mock AuditService auditService;
    PromptTemplateService service;

    @BeforeEach void setup() {
        service = new PromptTemplateService(repository, users, transactions,
                generationConfigRepository, generationConfigService, auditService);
    }

    @Test void bothCanonicalDefaultsCreateInactiveDraftsAndPassTheirConfigurationContract() {
        when(users.requireCurrentUser()).thenReturn(new User());
        when(repository.saveAndFlush(any())).thenAnswer(call -> {
            PromptTemplate template = call.getArgument(0);
            template.setId(UUID.randomUUID());
            when(repository.findById(template.getId())).thenReturn(Optional.of(template));
            return template;
        });
        service.defaults().forEach((key, system) -> {
            var draft = service.create(key, "configuration-fixture", system, "display-hint");
            assertThat(draft.isActive()).isFalse();
            assertThat(service.validateConfiguration(draft.getId())).isEmpty();
        });
    }

    @ParameterizedTest @NullAndEmptySource @ValueSource(strings = {"UNKNOWN", "citation_review", " CHECK_STANDARD "})
    void unsupportedKeyFailsBeforeRepositoryCalls(String key) {
        assertThatThrownBy(() -> service.create(key, "v1", PromptTemplateService.CHECK_STANDARD_DEFAULT, null))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(400));
        verifyNoInteractions(repository, users);
    }

    @Test void contractsAndFieldBoundsAreCheckedBeforeWrites() {
        for (String key : service.defaults().keySet()) {
            String other = key.equals("CHECK_STANDARD") ? "CITATION_REVIEW" : "CHECK_STANDARD";
            assertBadRequest(key, "v1", service.defaults().get(other), null);
            for (String version : new String[]{null, "", " ", "v".repeat(51)})
                assertBadRequest(key, version, service.defaults().get(key), null);
            for (String text : new String[]{null, "", " ", sizedPrompt(service.defaults().get(key), 8001, "x")})
                assertBadRequest(key, "v1", text, null);
            assertThatCode(() -> service.create(key, "v8000", sizedPrompt(service.defaults().get(key), 8000, "😀"), null))
                    .doesNotThrowAnyException();
            clearInvocations(repository, users);
            assertBadRequest(key, "v8001", sizedPrompt(service.defaults().get(key), 8001, "😀"), null);
            assertBadRequest(key, "raw-whitespace", sizedPrompt(service.defaults().get(key), 8000, "x") + " ", null);
            assertBadRequest(key, "v1", service.defaults().get(key), "m".repeat(101));
        }
        verifyNoInteractions(repository, users);
    }

    private void assertBadRequest(String key, String version, String text, String model) {
        assertThatThrownBy(() -> service.create(key, version, text, model))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(400));
    }

    private String sizedPrompt(String base, int codePoints, String filler) {
        return base + filler.repeat(codePoints - base.codePointCount(0, base.length()));
    }

    @Test void duplicateVersionAndConcurrentDuplicateReturnConflict() {
        var existing = draft();
        when(repository.findByTemplateKeyOrderByCreatedAtDesc("CHECK_STANDARD")).thenReturn(List.of(existing));
        assertThatThrownBy(() -> service.create("CHECK_STANDARD", " v1 ", existing.getSystemText(), null))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(409));
        when(repository.findByTemplateKeyOrderByCreatedAtDesc("CHECK_STANDARD")).thenReturn(List.of());
        when(repository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("duplicate key"));
        assertThatThrownBy(() -> service.create("CHECK_STANDARD", "v1", existing.getSystemText(), null))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(409));
    }

    @Test void resolveFallsBackOnlyWhenNoActiveRowExistsAndHashesAllSnapshotFields() {
        var initial = service.resolve("CHECK_STANDARD");
        assertThat(initial.systemText()).isEqualTo(PromptTemplateService.CHECK_STANDARD_DEFAULT);
        var active = draft();
        when(repository.findByTemplateKeyAndActiveTrue("CHECK_STANDARD")).thenReturn(Optional.of(active));
        var resolved = service.resolve("CHECK_STANDARD");
        assertThat(resolved.fingerprint()).isNotEqualTo(initial.fingerprint());
        active.setSystemText(active.getSystemText() + "\nA different instruction.");
        assertThat(service.resolve("CHECK_STANDARD").fingerprint()).isNotEqualTo(resolved.fingerprint());
        assertThat(resolved.systemText()).isEqualTo(PromptTemplateService.CHECK_STANDARD_DEFAULT);
        assertThat(new PromptTemplateService.ResolvedPrompt("other", resolved.version(), resolved.systemText()).fingerprint())
                .isNotEqualTo(resolved.fingerprint());
    }

    @Test void databaseFailureMultipleActivesAndInvalidActiveConfigurationAreVisible() {
        for (var failure : List.of(new DataAccessResourceFailureException("database unavailable"),
                new IncorrectResultSizeDataAccessException(1, 2))) {
            doThrow(failure).when(repository).findByTemplateKeyAndActiveTrue("CHECK_STANDARD");
            assertThatThrownBy(() -> service.resolve("CHECK_STANDARD")).isSameAs(failure);
        }
        var active = draft();
        active.setSystemText("invalid");
        doReturn(Optional.of(active)).when(repository).findByTemplateKeyAndActiveTrue("CHECK_STANDARD");
        assertThatThrownBy(() -> service.resolve("CHECK_STANDARD")).isInstanceOf(IllegalStateException.class);
    }

    @Test void activationRevalidatesLockedDraftBeforeDeactivatingAnything() {
        var invalid = draft();
        invalid.setSystemText("invalid");
        when(repository.findById(invalid.getId())).thenReturn(Optional.of(invalid));
        when(repository.lockVersions("CHECK_STANDARD")).thenReturn(List.of(invalid));
        var config = new com.evidencepilot.model.AiGenerationConfig();
        var selection = new AiModelClient.GenerationSelection(1, "remote", List.of("model"),
                "a".repeat(64), "b".repeat(64));
        when(generationConfigRepository.lockCurrent()).thenReturn(Optional.of(config));
        when(generationConfigService.selectionOf(config)).thenReturn(Optional.of(selection));
        when(users.requireCurrentUser()).thenReturn(new User());
        String active = new PromptTemplateService.ResolvedPrompt("CHECK_STANDARD", "code-default",
                PromptTemplateService.CHECK_STANDARD_DEFAULT).fingerprint();
        assertThatThrownBy(() -> service.activate(invalid.getId(), active, selection.fingerprint()))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(422));
        verify(repository, never()).save(any());
        verify(repository, never()).flush();
        verify(repository, never()).saveAndFlush(any());
    }

    private PromptTemplate draft() {
        var draft = new PromptTemplate();
        draft.setId(UUID.randomUUID());
        draft.setTemplateKey("CHECK_STANDARD");
        draft.setVersion("v1");
        draft.setSystemText(PromptTemplateService.CHECK_STANDARD_DEFAULT);
        return draft;
    }
}
