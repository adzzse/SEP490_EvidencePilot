package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.TraceDecisionRequest;
import com.evidencepilot.dto.request.TraceReviewRequest;
import com.evidencepilot.dto.response.SectionCitationReviewResponse;
import com.evidencepilot.model.CitationReviewRound;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.EvidenceRevisionTrace;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.InstructorJudgment;
import com.evidencepilot.model.enums.StudentAction;
import com.evidencepilot.model.enums.TraceOutcome;
import com.evidencepilot.repository.CitationReviewRoundRepository;
import com.evidencepilot.repository.DocumentChunkRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.CurrentUserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EvidenceTraceServiceTest {

    private final CitationReviewRoundRepository roundRepository =
            mock(CitationReviewRoundRepository.class);
    private final EvidenceRevisionTraceRepository traceRepository =
            mock(EvidenceRevisionTraceRepository.class);
    private final PaperSectionRepository paperSectionRepository =
            mock(PaperSectionRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final DocumentRepository documentRepository = mock(DocumentRepository.class);
    private final DocumentChunkRepository documentChunkRepository =
            mock(DocumentChunkRepository.class);
    private final SectionCitationReviewService reviewService =
            mock(SectionCitationReviewService.class);
    private final AiModelClient aiModelClient = mock(AiModelClient.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    private EvidenceTraceService service;

    @BeforeEach
    void setUp() {
        service = new EvidenceTraceService(
                roundRepository,
                traceRepository,
                paperSectionRepository,
                userRepository,
                documentRepository,
                documentChunkRepository,
                reviewService,
                aiModelClient,
                currentUserService,
                objectMapper);
        when(traceRepository.save(any(EvidenceRevisionTrace.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void decide_changedSectionStoresTrimmedActionAndServerSnapshot() {
        Fixture fixture = fixture();
        fixture.section.setContentTex("Updated claim with supporting detail.");
        fixture.section.setVersion(4);
        when(traceRepository.findById(fixture.trace.getId()))
                .thenReturn(Optional.of(fixture.trace));
        when(reviewService.sectionContentFingerprint(fixture.section))
                .thenReturn("after-fingerprint");

        var response = service.decide(
                fixture.document.getId(),
                fixture.section.getId(),
                fixture.trace.getId(),
                decision(StudentAction.PARAPHRASE, "  Clarified the claim.  "));

        assertThat(response.studentAction()).isEqualTo(StudentAction.PARAPHRASE);
        assertThat(response.explanation()).isEqualTo("Clarified the claim.");
        assertThat(response.afterPassage()).contains("Updated claim");
        assertThat(response.afterSectionVersion()).isEqualTo(4);
        assertThat(response.outcome()).isEqualTo(TraceOutcome.STALE);
        assertThat(fixture.trace.getAfterFingerprint()).isEqualTo("after-fingerprint");
        assertThat(fixture.trace.getRoundDurationMs()).isNotNegative();
    }

    @Test
    void decide_editActionWithoutSectionChangeIsRejected() {
        Fixture fixture = fixture();
        when(traceRepository.findById(fixture.trace.getId()))
                .thenReturn(Optional.of(fixture.trace));
        when(reviewService.sectionContentFingerprint(fixture.section))
                .thenReturn("before-content-fingerprint");

        assertThatThrownBy(() -> service.decide(
                fixture.document.getId(),
                fixture.section.getId(),
                fixture.trace.getId(),
                decision(StudentAction.ADD_CITATION, "Added the missing citation.")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("SECTION_NOT_CHANGED");

        verify(traceRepository, never()).save(fixture.trace);
    }

    @Test
    void decide_dismissWithReasonAllowsUnchangedSection() {
        Fixture fixture = fixture();
        when(traceRepository.findById(fixture.trace.getId()))
                .thenReturn(Optional.of(fixture.trace));
        when(reviewService.sectionContentFingerprint(fixture.section))
                .thenReturn("before-content-fingerprint");

        var response = service.decide(
                fixture.document.getId(),
                fixture.section.getId(),
                fixture.trace.getId(),
                decision(StudentAction.DISMISS_WITH_REASON, "The existing citation already supports it."));

        assertThat(response.studentAction()).isEqualTo(StudentAction.DISMISS_WITH_REASON);
        assertThat(response.outcome()).isEqualTo(TraceOutcome.UNRESOLVED);
    }

    @Test
    void decide_judgedTraceIsLocked() {
        Fixture fixture = fixture();
        fixture.trace.setJudgment(InstructorJudgment.EFFECTIVE);
        when(traceRepository.findById(fixture.trace.getId()))
                .thenReturn(Optional.of(fixture.trace));

        assertThatThrownBy(() -> service.decide(
                fixture.document.getId(),
                fixture.section.getId(),
                fixture.trace.getId(),
                decision(StudentAction.REMOVE, "Removed the unsupported claim.")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("TRACE_ALREADY_JUDGED");
    }

    @Test
    void stampStaleStoresTheNewContentFingerprint() {
        Fixture fixture = fixture();
        when(traceRepository.findBySectionIdOrderByCreatedAtDesc(fixture.section.getId()))
                .thenReturn(List.of(fixture.trace));
        when(reviewService.sectionContentFingerprint("Updated claim."))
                .thenReturn("updated-content-fingerprint");

        service.stampStaleOnContentChanged(
                fixture.section.getId(), "Updated claim.", 4);

        assertThat(fixture.trace.getOutcome()).isEqualTo(TraceOutcome.STALE);
        assertThat(fixture.trace.getAfterFingerprint())
                .isEqualTo("updated-content-fingerprint");
        assertThat(fixture.trace.getAfterSectionVersion()).isEqualTo(4);
        verify(traceRepository).saveAll(List.of(fixture.trace));
    }

    @ParameterizedTest
    @CsvSource({
            "EFFECTIVE, RESOLVED",
            "PARTIAL, PARTIALLY_RESOLVED",
            "INEFFECTIVE, UNRESOLVED"
    })
    void review_mapsInstructorJudgmentToOutcome(
            InstructorJudgment judgment, TraceOutcome expectedOutcome) {
        Fixture fixture = fixture();
        User instructor = new User();
        instructor.setId(UUID.randomUUID());
        when(traceRepository.findById(fixture.trace.getId()))
                .thenReturn(Optional.of(fixture.trace));
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);

        var response = service.review(
                fixture.project.getId(),
                fixture.trace.getId(),
                new TraceReviewRequest(judgment, "Instructor note"));

        assertThat(response.judgment()).isEqualTo(judgment);
        assertThat(response.outcome()).isEqualTo(expectedOutcome);
    }

    @Test
    void materialize_alwaysCreatesRoundAndTargetsImmediateAddressedRound() {
        Fixture fixture = fixture();
        User requester = new User();
        requester.setId(UUID.randomUUID());
        when(paperSectionRepository.findByIdWithDocument(fixture.section.getId()))
                .thenReturn(Optional.of(fixture.section));
        when(reviewService.reviewInputFingerprint(fixture.section))
                .thenReturn("before-review-input-fingerprint");
        when(reviewService.sectionContentFingerprint(fixture.section))
                .thenReturn("before-content-fingerprint");
        when(roundRepository.findFirstBySectionIdOrderByCreatedAtDesc(fixture.section.getId()))
                .thenReturn(Optional.of(fixture.round));
        when(userRepository.findById(requester.getId())).thenReturn(Optional.of(requester));
        when(roundRepository.save(any(CitationReviewRound.class))).thenAnswer(invocation -> {
            CitationReviewRound saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        fixture.trace.setStudentAction(StudentAction.QUALIFY);
        when(traceRepository.findByRoundIdOrderByFindingIndex(fixture.round.getId()))
                .thenReturn(List.of(fixture.trace));

        var result = service.materialize(
                fixture.document.getId(),
                fixture.section.getId(),
                requester.getId(),
                reviewResponse(fixture.section));

        assertThat(result.roundId()).isNotNull().isNotEqualTo(fixture.round.getId());
        assertThat(result.previousRoundId()).isEqualTo(fixture.round.getId());
        assertThat(result.recheckRequired()).isTrue();
        verify(traceRepository).saveAll(any());
    }

    @Test
    void materializeRejectsReviewWhenInputChangedDuringGeneration() {
        Fixture fixture = fixture();
        when(paperSectionRepository.findByIdWithDocument(fixture.section.getId()))
                .thenReturn(Optional.of(fixture.section));
        when(reviewService.reviewInputFingerprint(fixture.section))
                .thenReturn("new-review-input-fingerprint");
        when(reviewService.sectionContentFingerprint(fixture.section))
                .thenReturn("before-content-fingerprint");

        assertThatThrownBy(() -> service.materialize(
                fixture.document.getId(),
                fixture.section.getId(),
                UUID.randomUUID(),
                reviewResponse(fixture.section)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("SECTION_REVIEW_INPUT_CHANGED");

        verify(roundRepository, never()).save(any(CitationReviewRound.class));
        verify(traceRepository, never()).saveAll(any());
    }

    @Test
    void recheck_setsOnlyAiAdvisoryAndRevisionLink() {
        Fixture fixture = fixture();
        CitationReviewRound linkedRound = linkedRound(fixture);
        fixture.trace.setStudentAction(StudentAction.QUALIFY);
        fixture.trace.setExplanation("Narrowed the claim.");
        fixture.trace.setAfterPassage("The revised, qualified claim.");
        fixture.trace.setJudgment(InstructorJudgment.EFFECTIVE);
        fixture.trace.setInstructorFeedback("Human decision");
        fixture.trace.setOutcome(TraceOutcome.RESOLVED);
        when(roundRepository.findById(fixture.round.getId()))
                .thenReturn(Optional.of(fixture.round));
        when(roundRepository.findById(linkedRound.getId()))
                .thenReturn(Optional.of(linkedRound));
        when(traceRepository.findByRoundIdOrderByFindingIndex(fixture.round.getId()))
                .thenReturn(List.of(fixture.trace));
        when(aiModelClient.generateForReview(anyString(), anyString()))
                .thenReturn(new AiModelClient.GenerationResult(
                        "provider",
                        "model",
                        "{\"results\":[{\"traceId\":\"" + fixture.trace.getId()
                                + "\",\"judgment\":\"INEFFECTIVE\","
                                + "\"reason\":\"The new round still lacks support.\"}]}"));

        int count = service.recheck(
                fixture.project.getId(), fixture.round.getId(), linkedRound.getId());

        assertThat(count).isEqualTo(1);
        assertThat(fixture.trace.getLinkedRound()).isSameAs(linkedRound);
        assertThat(fixture.trace.getLinkedMode())
                .isEqualTo(CitationReviewRound.LINK_MODE_REVISION_CHAIN);
        assertThat(fixture.trace.getAiRecheckJudgment())
                .isEqualTo(InstructorJudgment.INEFFECTIVE);
        assertThat(fixture.trace.getAiRecheckReason())
                .isEqualTo("The new round still lacks support.");
        assertThat(fixture.trace.getAiRecheckedAt()).isNotNull();
        assertThat(fixture.trace.getJudgment()).isEqualTo(InstructorJudgment.EFFECTIVE);
        assertThat(fixture.trace.getInstructorFeedback()).isEqualTo("Human decision");
        assertThat(fixture.trace.getOutcome()).isEqualTo(TraceOutcome.RESOLVED);
    }

    @Test
    void recheck_aiFailureLeavesInstructorStateUntouched() {
        Fixture fixture = fixture();
        CitationReviewRound linkedRound = linkedRound(fixture);
        fixture.trace.setStudentAction(StudentAction.QUALIFY);
        fixture.trace.setJudgment(InstructorJudgment.PARTIAL);
        fixture.trace.setInstructorFeedback("Keep this human review");
        fixture.trace.setOutcome(TraceOutcome.PARTIALLY_RESOLVED);
        when(roundRepository.findById(fixture.round.getId()))
                .thenReturn(Optional.of(fixture.round));
        when(roundRepository.findById(linkedRound.getId()))
                .thenReturn(Optional.of(linkedRound));
        when(traceRepository.findByRoundIdOrderByFindingIndex(fixture.round.getId()))
                .thenReturn(List.of(fixture.trace));
        when(aiModelClient.generateForReview(anyString(), anyString()))
                .thenThrow(new AiModelClient.AiApiException("/ai/generate", 503));

        assertThatThrownBy(() -> service.recheck(
                fixture.project.getId(), fixture.round.getId(), linkedRound.getId()))
                .isInstanceOf(AiModelClient.AiApiException.class);

        assertThat(fixture.trace.getLinkedRound()).isNull();
        assertThat(fixture.trace.getAiRecheckJudgment()).isNull();
        assertThat(fixture.trace.getJudgment()).isEqualTo(InstructorJudgment.PARTIAL);
        assertThat(fixture.trace.getInstructorFeedback()).isEqualTo("Keep this human review");
        assertThat(fixture.trace.getOutcome()).isEqualTo(TraceOutcome.PARTIALLY_RESOLVED);
        verify(traceRepository, never()).saveAll(List.of(fixture.trace));
    }

    private TraceDecisionRequest decision(StudentAction action, String explanation) {
        return new TraceDecisionRequest(action, explanation, null, null, null, null);
    }

    private SectionCitationReviewResponse reviewResponse(PaperSection section) {
        return new SectionCitationReviewResponse(
                "section-citation-v1",
                "citation-rules-v1",
                section.getId(),
                section.getVersion(),
                "before-review-input-fingerprint",
                "before-content-fingerprint",
                LocalDateTime.now(),
                "provider",
                "model",
                true,
                "Review complete",
                List.of(new SectionCitationReviewResponse.Finding(
                        SectionCitationReviewResponse.FindingType.UNSUBSTANTIATED_CLAIM,
                        "Original claim",
                        0,
                        8,
                        "Needs a source",
                        SectionCitationReviewResponse.Confidence.HIGH,
                        List.of())),
                List.of());
    }

    private CitationReviewRound linkedRound(Fixture fixture) {
        CitationReviewRound linked = new CitationReviewRound();
        linked.setId(UUID.randomUUID());
        linked.setProject(fixture.project);
        linked.setSection(fixture.section);
        linked.setCreatedAt(LocalDateTime.now());
        return linked;
    }

    private Fixture fixture() {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setProject(project);
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(document);
        section.setSectionTitle("Introduction");
        section.setContentTex("Original claim.");
        section.setVersion(3);
        section.setActive(true);
        CitationReviewRound round = new CitationReviewRound();
        round.setId(UUID.randomUUID());
        round.setProject(project);
        round.setSection(section);
        round.setReviewInputFingerprint("before-review-input-fingerprint");
        round.setSectionContentFingerprint("before-content-fingerprint");
        round.setCreatedAt(LocalDateTime.now().minusMinutes(2));
        EvidenceRevisionTrace trace = new EvidenceRevisionTrace();
        trace.setId(UUID.randomUUID());
        trace.setRound(round);
        trace.setSection(section);
        trace.setFindingIndex(0);
        trace.setSuggestedAction("ADD_CITATION");
        trace.setExcerpt("Original");
        trace.setExcerptStart(0);
        trace.setExcerptEnd(8);
        trace.setRationale("Needs a source");
        trace.setCreatedAt(round.getCreatedAt());
        return new Fixture(project, document, section, round, trace);
    }

    private record Fixture(
            Project project,
            Document document,
            PaperSection section,
            CitationReviewRound round,
            EvidenceRevisionTrace trace) {
    }
}
