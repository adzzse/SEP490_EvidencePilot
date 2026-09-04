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
        service = new SectionStandardService(
                aiModelClient,
                paperSectionRepository,
                evaluationRepository,
                currentUserService,
                new ObjectMapper());
    }

    @Test
    void evaluateUsesPersistedConfiguration() {
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
        when(aiModelClient.generateStrict(anyString(), anyString(), anyMap())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", """
                        {"summary":"The thesis is present.","limitations":[],"items":[
                          {"requirement":"Has thesis","verdict":"MET","evidence":"clear thesis","reason":"Clear","missing":"","suggestion":""}
                        ]}
                        """));

        var response = service.evaluate(section.getDocument().getId(), section.getId());

        ArgumentCaptor<String> prompt = ArgumentCaptor.forClass(String.class);
        verify(aiModelClient).generateStrict(anyString(), prompt.capture(), anyMap());
        assertThat(prompt.getValue()).contains("\"requirements\":[\"Has thesis\"]");
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
