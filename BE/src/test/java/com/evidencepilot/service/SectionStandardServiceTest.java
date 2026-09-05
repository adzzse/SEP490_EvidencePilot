package com.evidencepilot.service;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.SectionStandardEvaluation;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.SectionStandardEvaluationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SectionStandardServiceTest {

    @Mock
    private AiModelClient aiModelClient;
    @Mock
    private PaperSectionRepository paperSectionRepository;
    @Mock
    private SectionStandardEvaluationRepository evaluationRepository;
    @Mock
    private CurrentUserService currentUserService;

    private SectionStandardService service;

    @BeforeEach
    void setUp() {
        // The client tests cover continuation; these tests exercise the supplied domain validator.
        org.mockito.Mockito.lenient().doAnswer(invocation -> {
            AiModelClient.GenerationResult generated = aiModelClient.generateStrict(invocation.getArgument(0), invocation.getArgument(1), invocation.getArgument(2));
            java.util.function.Function<AiModelClient.GenerationResult, ?> validator = invocation.getArgument(3);
            try {
                return validator.apply(generated);
            } catch (IllegalArgumentException invalid) {
                throw new AiModelClient.AiApiException("/ai/generate", 502,
                        "INVALID_GENERATION_RESPONSE", "INVALID_GENERATION_RESPONSE", null, null);
            }
        }).when(aiModelClient).generateValidated(anyString(), anyString(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

        service = new SectionStandardService(
                aiModelClient,
                paperSectionRepository,
                evaluationRepository,
                currentUserService,
                new ObjectMapper(),
                org.mockito.Mockito.mock(org.springframework.transaction.PlatformTransactionManager.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"valid", "missing_summary", "evidence_for_not_met", "malformed"})
    void evaluateUsesPersistedConfiguration(String scenario) {
        PaperSection section = section();
        User instructor = user(UserRole.INSTRUCTOR);
        SectionStandardEvaluation evaluation = configured(section);
        when(paperSectionRepository.findByIdWithDocument(section.getId())).thenReturn(Optional.of(section));
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(evaluationRepository.findTopBySectionIdOrderByUpdatedAtDesc(section.getId()))
                .thenReturn(Optional.of(evaluation));
        when(evaluationRepository.save(any(SectionStandardEvaluation.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        String valid = """
                {"summary":"The thesis is present.","limitations":[],"items":[
                  {"requirement":"Has thesis","verdict":"MET","evidence":"clear thesis","reason":"Clear","missing":"","suggestion":""}
                ]}
                """;
        String first = switch (scenario) {
            case "missing_summary" -> valid.replace("\"summary\"", "\"items_summary\"");
            case "evidence_for_not_met" -> valid.replace("\"MET\"", "\"NOT_MET\"");
            case "malformed" -> "not JSON";
            default -> valid;
        };
        when(aiModelClient.generateStrict(anyString(), anyString(), anyMap())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", first),
                new AiModelClient.GenerationResult("provider", "model", valid));

        var response = service.evaluate(section.getDocument().getId(), section.getId());

        ArgumentCaptor<String> prompt = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        verify(aiModelClient)
                .generateStrict(system.capture(), prompt.capture(), anyMap());
        assertThat(prompt.getValue()).contains("\"requirements\":[\"Has thesis\"]");
        assertThat(prompt.getAllValues()).allMatch(value -> value.equals(prompt.getValue()));
        if (!scenario.equals("valid")) {
            assertThat(response.status()).isEqualTo(SectionStandardEvaluation.STATUS_SYSTEM_ERROR);
            assertThat(response.errorCode()).isEqualTo("INVALID_AI_RESPONSE");
            return;
        }
        assertThat(response.status()).isEqualTo(SectionStandardEvaluation.STATUS_COMPLETED);
        assertThat(response.result().get("items").get(0).get("verdict").asText()).isEqualTo("MET");
        assertThat(service.matchesCurrentInput(evaluation, section)).isTrue();

        section.setContentTex("The thesis changed after evaluation.");
        assertThat(service.matchesCurrentInput(evaluation, section)).isFalse();

        evaluation.setStatus(SectionStandardEvaluation.STATUS_STALE);
        var stale = service.latest(section.getDocument().getId(), section.getId()).orElseThrow();
        assertThat(stale.status()).isEqualTo(SectionStandardEvaluation.STATUS_STALE);
        assertThat(stale.stale()).isTrue();
    }

    @Test
    void evaluateRejectsUnknownNestedResponseFields() {
        PaperSection section = section();
        User instructor = user(UserRole.INSTRUCTOR);
        SectionStandardEvaluation evaluation = configured(section);
        String raw = """
                {"summary":"The thesis is present.","limitations":[],"items":[
                  {"requirement":"Has thesis","verdict":"MET","evidence":"clear thesis","reason":"Clear","missing":"","suggestion":"","extra":true}
                ]}
                """;
        when(paperSectionRepository.findByIdWithDocument(section.getId())).thenReturn(Optional.of(section));
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(evaluationRepository.findTopBySectionIdOrderByUpdatedAtDesc(section.getId()))
                .thenReturn(Optional.of(evaluation));
        when(evaluationRepository.save(any(SectionStandardEvaluation.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(aiModelClient.generateStrict(anyString(), anyString(), anyMap())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", raw));

        var response = service.evaluate(section.getDocument().getId(), section.getId());

        assertThat(response.status()).isEqualTo(SectionStandardEvaluation.STATUS_SYSTEM_ERROR);
        assertThat(response.result()).isNull();
        assertThat(response.errorCode()).isEqualTo("INVALID_AI_RESPONSE");
        assertThat(evaluation.getRawOutput()).isEqualTo(raw);
        verify(aiModelClient).generateStrict(anyString(), anyString(), anyMap());
        verify(evaluationRepository).save(evaluation);
    }

    @Test
    void studentCannotConfigureStandards() {
        PaperSection section = section();
        User student = user(UserRole.STUDENT);
        when(paperSectionRepository.findByIdWithDocument(section.getId())).thenReturn(Optional.of(section));
        when(currentUserService.requireCurrentUser()).thenReturn(student);

        assertThatThrownBy(() -> service.saveConfig(
                section.getDocument().getId(), section.getId(), List.of("Has thesis")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));

        verify(evaluationRepository, never()).save(org.mockito.ArgumentMatchers.any());
        verifyNoInteractions(aiModelClient);
    }

    @Test
    void latestRequiresProjectAccessBeforeReadingEvaluation() {
        PaperSection section = section();
        User outsider = user(UserRole.STUDENT);
        when(paperSectionRepository.findByIdWithDocument(section.getId())).thenReturn(Optional.of(section));
        when(currentUserService.requireCurrentUser()).thenReturn(outsider);
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "no access"))
                .when(currentUserService).requireProjectAccess(outsider, section.getDocument().getProject());

        assertThatThrownBy(() -> service.latest(section.getDocument().getId(), section.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));

        verifyNoInteractions(evaluationRepository);
    }

    @Test
    void queuedEvaluationRejectsChangedInputBeforeCallingProvider() {
        PaperSection section = section();
        User instructor = user(UserRole.INSTRUCTOR);
        when(paperSectionRepository.findByIdWithDocument(section.getId())).thenReturn(Optional.of(section));
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(evaluationRepository.findTopBySectionIdOrderByUpdatedAtDesc(section.getId()))
                .thenReturn(Optional.of(configured(section)));

        assertThatThrownBy(() -> service.evaluate(section.getDocument().getId(), section.getId(),
                section.getDocument().getProject().getId(), instructor, "older-input"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("STANDARD_INPUT_CHANGED");
        verifyNoInteractions(aiModelClient);
        verify(evaluationRepository, never()).save(any());
    }

    @Test
    void queuedEvaluationRechecksAssignmentBeforeReadingConfiguration() {
        PaperSection section = section();
        User student = user(UserRole.STUDENT);
        when(paperSectionRepository.findByIdWithDocument(section.getId())).thenReturn(Optional.of(section));
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "not assigned"))
                .when(currentUserService).requireSectionAssignment(student, section);

        assertThatThrownBy(() -> service.evaluate(section.getDocument().getId(), section.getId(),
                section.getDocument().getProject().getId(), student, "queued-input"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("not assigned");
        verifyNoInteractions(aiModelClient, evaluationRepository);
    }

    @Test
    void queuedEvaluationRejectsSectionFromAnotherProject() {
        PaperSection section = section();
        User instructor = user(UserRole.INSTRUCTOR);
        when(paperSectionRepository.findByIdWithDocument(section.getId())).thenReturn(Optional.of(section));
        when(currentUserService.isInstructor(instructor)).thenReturn(true);

        assertThatThrownBy(() -> service.evaluate(section.getDocument().getId(), section.getId(),
                UUID.randomUUID(), instructor, "queued-input"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("job project");
        verifyNoInteractions(aiModelClient, evaluationRepository);
    }

    private PaperSection section() {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setProject(project);
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(document);
        section.setSectionTitle("Introduction");
        section.setContentTex("A clear thesis is presented.");
        section.setActive(true);
        return section;
    }

    private SectionStandardEvaluation configured(PaperSection section) {
        SectionStandardEvaluation evaluation = new SectionStandardEvaluation();
        evaluation.setSectionId(section.getId());
        evaluation.setDocumentId(section.getDocument().getId());
        evaluation.setProjectId(section.getDocument().getProject().getId());
        evaluation.setStatus(SectionStandardEvaluation.STATUS_CONFIGURED);
        evaluation.setRequirements(List.of("Has thesis"));
        return evaluation;
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        return user;
    }
}
