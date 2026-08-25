package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.SectionReviewSourceMatchRequest;
import com.evidencepilot.dto.response.SectionCitationReviewResponse;
import com.evidencepilot.dto.response.SectionReviewSourceMatchesResponse;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ReviewSnapshot;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.prompt.SectionCitationReviewPrompt;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ReviewSnapshotRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.AuditService;
import com.evidencepilot.service.PaperStandardService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SectionCitationReviewServiceTest {

    private final AiModelClient aiModelClient = mock(AiModelClient.class);
    private final PaperSectionRepository sectionRepository = mock(PaperSectionRepository.class);
    private final ReviewSnapshotRepository snapshotRepository = mock(ReviewSnapshotRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final SourceMatchingService sourceMatchingService = mock(SourceMatchingService.class);
    private final AuditService auditService = mock(AuditService.class);
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void runPersistsGroundedSourceDiscrepancyFinding() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        String prefix = "Prior work provides context. ";
        String excerpt = "Smith et al. report 92 percent accuracy on the benchmark";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", prefix + excerpt + ".");
        User actor = new User();
        actor.setId(actorId);
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        DocumentChunk retrievedChunk = sourceChunk(sourceId, chunkId,
                "The final model achieved 89.2 percent accuracy on the benchmark evaluation.");
        when(sourceMatchingService.search(eq(projectId), any(), eq(5)))
                .thenReturn(List.of(List.of(
                        new SourceMatchingService.SourceMatch(retrievedChunk, 0.91f))));
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"SOURCE_DISCREPANCY",
                          "excerpt":"%s",
                          "rationale":"The paper reports 92 percent but the cited source reports 89.2 percent.",
                          "confidence":"HIGH",
                          "evidence":[{"source_id":"%s","chunk_id":"%s",
                            "quote":"achieved 89.2 percent accuracy",
                            "relation":"CONTRADICTS"}]
                        }]}
                        """, sectionId, excerpt, sourceId, chunkId)));

        SectionCitationReviewResponse result = service().run(
                documentId, projectId, sectionId, service().reviewInputFingerprint(section), actorId);

        assertThat(result.complete()).isTrue();
        assertThat(result.summary()).contains("1 source discrepanc");
        assertThat(result.findings()).singleElement().satisfies(finding -> {
            assertThat(finding.type())
                    .isEqualTo(SectionCitationReviewResponse.FindingType.SOURCE_DISCREPANCY);
            assertThat(finding.excerpt()).isEqualTo(excerpt);
            assertThat(finding.startOffset()).isEqualTo(prefix.length());
            assertThat(finding.endOffset()).isEqualTo(prefix.length() + excerpt.length());
            assertThat(finding.confidence())
                    .isEqualTo(SectionCitationReviewResponse.Confidence.HIGH);
            assertThat(finding.evidence()).singleElement().satisfies(evidence -> {
                assertThat(evidence.sourceId()).isEqualTo(sourceId);
                assertThat(evidence.chunkId()).isEqualTo(chunkId);
                assertThat(evidence.quote()).isEqualTo("achieved 89.2 percent accuracy");
                assertThat(evidence.relation())
                        .isEqualTo(SectionCitationReviewResponse.EvidenceRelation.CONTRADICTS);
            });
        });
        verify(aiModelClient).generateForReview(
                eq(SectionCitationReviewPrompt.SYSTEM), anyString());
        verify(snapshotRepository).save(any(ReviewSnapshot.class));
        verify(auditService).record(
                "AI_SECTION_CITATION_REVIEW", "PaperSection", sectionId, actor, null, result);
    }

    @Test
    void runPersistsUnsubstantiatedClaimWithoutRetrievedEvidence() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        String prefix = "Background context. ";
        String excerpt = "The proposed method improves recall by exactly 34 percent over the Alpha baseline";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", prefix + excerpt + ".");
        User actor = new User();
        actor.setId(actorId);
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"UNSUBSTANTIATED_CLAIM",
                          "excerpt":"%s",
                          "rationale":"The precise comparison has no supporting project source.",
                          "confidence":"HIGH",
                          "evidence":[]
                        }]}
                        """, sectionId, excerpt)));

        SectionCitationReviewService service = service();
        SectionCitationReviewResponse result = service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), actorId);

        assertThat(result.complete()).isTrue();
        assertThat(result.summary()).contains("1 unsubstantiated claim");
        assertThat(result.findings()).singleElement().satisfies(finding -> {
            assertThat(finding.type())
                    .isEqualTo(SectionCitationReviewResponse.FindingType.UNSUBSTANTIATED_CLAIM);
            assertThat(finding.startOffset()).isEqualTo(prefix.length());
            assertThat(finding.endOffset()).isEqualTo(prefix.length() + excerpt.length());
            assertThat(finding.evidence()).isEmpty();
        });
        verify(snapshotRepository).save(any(ReviewSnapshot.class));
        verify(auditService).record(
                "AI_SECTION_CITATION_REVIEW", "PaperSection", sectionId, actor, null, result);
    }

    @Test
    void runAcceptsRationaleWithinBackendToleranceWhilePromptStaysConcise() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        String excerpt = "The proposed method improves recall by exactly 34 percent over the Alpha baseline";
        String rationale = "r".repeat(1_000);
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", excerpt + ".");
        User actor = new User();
        actor.setId(actorId);
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"UNSUBSTANTIATED_CLAIM",
                          "excerpt":"%s",
                          "rationale":"%s",
                          "confidence":"HIGH",
                          "evidence":[]
                        }]}
                        """, sectionId, excerpt, rationale)));

        SectionCitationReviewService service = service();
        SectionCitationReviewResponse result = service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), actorId);

        assertThat(result.findings()).singleElement().satisfies(finding ->
                assertThat(finding.rationale()).hasSize(1_000));
        assertThat(SectionCitationReviewPrompt.SYSTEM).contains("\"rationale\":\"max 400 chars");
        verify(aiModelClient).generateForReview(anyString(), anyString());
    }

    @Test
    void runKeepsGroundedFindingsWhenAnotherFindingIsInvalid() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        String excerpt = "The proposed method improves recall by exactly 34 percent over the Alpha baseline";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", excerpt + ".");
        User actor = new User();
        actor.setId(actorId);
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"UNSUBSTANTIATED_CLAIM",
                          "excerpt":"%s",
                          "rationale":"The precise comparison has no supporting project source.",
                          "confidence":"HIGH",
                          "evidence":[]
                        },{
                          "type":"UNSUBSTANTIATED_CLAIM",
                          "excerpt":"Paraphrased text that is absent from the section",
                          "rationale":"This finding is not grounded in the supplied chunk.",
                          "confidence":"LOW",
                          "evidence":[]
                        }]}
                        """, sectionId, excerpt)));

        SectionCitationReviewService service = service();
        SectionCitationReviewResponse result = service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), actorId);

        assertThat(result.complete()).isTrue();
        assertThat(result.findings()).singleElement().satisfies(finding ->
                assertThat(finding.excerpt()).isEqualTo(excerpt));
        assertThat(result.limitations()).singleElement().asString()
                .contains("omitted 1 invalid AI finding(s)");
        verify(aiModelClient).generateForReview(anyString(), anyString());
    }

    @Test
    void runAcceptsNotFoundRelationForRetrievedButNonSupportingEvidence() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        String excerpt = "The proposed method improves recall by exactly 34 percent over the Alpha baseline";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", excerpt + ".");
        User actor = new User();
        actor.setId(actorId);
        DocumentChunk retrievedChunk = sourceChunk(
                sourceId, chunkId, "This source discusses dataset collection but reports no recall comparison.");
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5)))
                .thenReturn(List.of(List.of(
                        new SourceMatchingService.SourceMatch(retrievedChunk, 0.42f))));
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"UNSUBSTANTIATED_CLAIM",
                          "excerpt":"%s",
                          "rationale":"The retrieved candidate does not substantiate the precise comparison.",
                          "confidence":"MEDIUM",
                          "evidence":[{"source_id":"%s","chunk_id":"%s",
                            "quote":"","relation":"NOT_FOUND"}]
                        }]}
                        """, sectionId, excerpt, sourceId, chunkId)));

        SectionCitationReviewService service = service();
        SectionCitationReviewResponse result = service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), actorId);

        assertThat(result.findings()).singleElement().satisfies(finding ->
                assertThat(finding.evidence()).singleElement().satisfies(evidence -> {
                    assertThat(evidence.sourceId()).isEqualTo(sourceId);
                    assertThat(evidence.chunkId()).isEqualTo(chunkId);
                    assertThat(evidence.quote()).isEmpty();
                    assertThat(evidence.relation())
                            .isEqualTo(SectionCitationReviewResponse.EvidenceRelation.NOT_FOUND);
                }));
    }

    @Test
    void runRejectsUnsubstantiatedClaimCarryingSupportingEvidence() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        String excerpt = "Our method improves recall by 34 percent over prior work";
        PaperSection section = section(projectId, documentId, sectionId, "Introduction", excerpt + ".");
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        DocumentChunk supportingChunk = sourceChunk(sourceId, chunkId,
                "Recall improved by 34 percent in the reported experiments.");
        when(sourceMatchingService.search(eq(projectId), any(), eq(5)))
                .thenReturn(List.of(List.of(
                        new SourceMatchingService.SourceMatch(supportingChunk, 0.88f))));
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"UNSUBSTANTIATED_CLAIM",
                          "excerpt":"%s",
                          "rationale":"Empirical claim without citation.",
                          "confidence":"MEDIUM",
                          "evidence":[{"source_id":"%s","chunk_id":"%s",
                            "quote":"Recall improved by 34 percent",
                            "relation":"SUPPORTS"}]
                        }]}
                        """, sectionId, excerpt, sourceId, chunkId)));

        assertThatThrownBy(() -> service().run(
                documentId, projectId, sectionId, service().reviewInputFingerprint(section), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
        verify(aiModelClient, times(2)).generateForReview(anyString(), anyString());
    }

    @Test
    void runRejectsSourceDiscrepancyWithoutContradictingEvidence() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        String excerpt = "Smith et al. report 92 percent accuracy on the benchmark";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", excerpt + ".");
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"SOURCE_DISCREPANCY",
                          "excerpt":"%s",
                          "rationale":"The source reports a different value.",
                          "confidence":"HIGH",
                          "evidence":[]
                        }]}
                        """, sectionId, excerpt)));

        SectionCitationReviewService service = service();
        assertThatThrownBy(() -> service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
        verify(aiModelClient, times(2)).generateForReview(anyString(), anyString());
    }

    @Test
    void runRejectsEvidenceQuoteThatIsNotVerbatimFromRetrievedChunk() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        String excerpt = "Smith et al. report 92 percent accuracy on the benchmark";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", excerpt + ".");
        DocumentChunk retrievedChunk = sourceChunk(
                sourceId, chunkId, "The final model achieved 89.2 percent accuracy.");
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5)))
                .thenReturn(List.of(List.of(
                        new SourceMatchingService.SourceMatch(retrievedChunk, 0.91f))));
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"SOURCE_DISCREPANCY",
                          "excerpt":"%s",
                          "rationale":"The source reports a different value.",
                          "confidence":"HIGH",
                          "evidence":[{"source_id":"%s","chunk_id":"%s",
                            "quote":"The final model achieved 88 percent accuracy",
                            "relation":"CONTRADICTS"}]
                        }]}
                        """, sectionId, excerpt, sourceId, chunkId)));

        SectionCitationReviewService service = service();
        assertThatThrownBy(() -> service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
        verify(aiModelClient, times(2)).generateForReview(anyString(), anyString());
    }

    @Test
    void runRejectsEvidenceChunkThatWasNotRetrievedForTheProject() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID retrievedSourceId = UUID.randomUUID();
        UUID retrievedChunkId = UUID.randomUUID();
        String excerpt = "Smith et al. report 92 percent accuracy on the benchmark";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", excerpt + ".");
        DocumentChunk retrievedChunk = sourceChunk(
                retrievedSourceId, retrievedChunkId,
                "The final model achieved 89.2 percent accuracy.");
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5)))
                .thenReturn(List.of(List.of(
                        new SourceMatchingService.SourceMatch(retrievedChunk, 0.91f))));
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"SOURCE_DISCREPANCY",
                          "excerpt":"%s",
                          "rationale":"The source reports a different value.",
                          "confidence":"HIGH",
                          "evidence":[{"source_id":"%s","chunk_id":"%s",
                            "quote":"fabricated quote","relation":"CONTRADICTS"}]
                        }]}
                        """, sectionId, excerpt, UUID.randomUUID(), UUID.randomUUID())));

        SectionCitationReviewService service = service();
        assertThatThrownBy(() -> service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
        verify(aiModelClient, times(2)).generateForReview(anyString(), anyString());
    }

    @Test
    void runRejectsMissingEvidenceArrayWithControlledBadGateway() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        String excerpt = "The proposed method improves recall by exactly 34 percent";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", excerpt + ".");
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"UNSUBSTANTIATED_CLAIM",
                          "excerpt":"%s",
                          "rationale":"The precise result has no supporting source.",
                          "confidence":"HIGH"
                        }]}
                        """, sectionId, excerpt)));

        SectionCitationReviewService service = service();
        assertThatThrownBy(() -> service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
        verify(aiModelClient, times(2)).generateForReview(anyString(), anyString());
    }

    @Test
    void runRejectsMoreThanTenFindings() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        List<String> excerpts = IntStream.range(0, 11)
                .mapToObj(index -> "External benchmark claim number " + index
                        + " reports exactly 90 percent accuracy")
                .toList();
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction",
                String.join(". ", excerpts) + ".");
        String findingsJson = IntStream.range(0, excerpts.size())
                .mapToObj(index -> String.format("""
                        {"type":"UNSUBSTANTIATED_CLAIM","excerpt":"%s",
                         "rationale":"No supporting source.","confidence":"LOW","evidence":[]}
                        """, excerpts.get(index)))
                .collect(Collectors.joining(","));
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format(
                        "{\"section_id\":\"%s\",\"chunk_index\":0,\"findings\":[%s]}",
                        sectionId, findingsJson)));

        SectionCitationReviewService service = service();
        assertThatThrownBy(() -> service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
        verify(aiModelClient, times(2)).generateForReview(anyString(), anyString());
    }

    @Test
    void runRejectsMoreThanThreeEvidenceEntriesPerFinding() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        String excerpt = "Smith et al. report 92 percent accuracy on the benchmark";
        String quote = "achieved 89.2 percent accuracy";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", excerpt + ".");
        DocumentChunk retrievedChunk = sourceChunk(
                sourceId, chunkId, "The final model " + quote + ".");
        String evidenceJson = IntStream.range(0, 4)
                .mapToObj(index -> String.format(
                        "{\"source_id\":\"%s\",\"chunk_id\":\"%s\","
                                + "\"quote\":\"%s\",\"relation\":\"CONTRADICTS\"}",
                        sourceId, chunkId, quote))
                .collect(Collectors.joining(","));
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5)))
                .thenReturn(List.of(List.of(
                        new SourceMatchingService.SourceMatch(retrievedChunk, 0.91f))));
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"SOURCE_DISCREPANCY",
                          "excerpt":"%s",
                          "rationale":"The source reports a different value.",
                          "confidence":"HIGH",
                          "evidence":[%s]
                        }]}
                        """, sectionId, excerpt, evidenceJson)));

        SectionCitationReviewService service = service();
        assertThatThrownBy(() -> service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
        verify(aiModelClient, times(2)).generateForReview(anyString(), anyString());
    }

    @Test
    void runRetriesInvalidJsonOnceAndUsesTheValidResponse() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction",
                "The section contains a sufficiently long external factual statement.");
        User actor = new User();
        actor.setId(actorId);
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("first-provider", "first-model", "not-json"),
                new AiModelClient.GenerationResult("retry-provider", "retry-model", String.format(
                        "{\"section_id\":\"%s\",\"chunk_index\":0,\"findings\":[]}",
                        sectionId)));

        SectionCitationReviewService service = service();
        SectionCitationReviewResponse result = service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), actorId);

        assertThat(result.complete()).isTrue();
        assertThat(result.provider()).isEqualTo("retry-provider");
        assertThat(result.model()).isEqualTo("retry-model");
        verify(aiModelClient).generateForReview(
                eq(SectionCitationReviewPrompt.SYSTEM),
                argThat(prompt -> !prompt.contains("Previous output was invalid")));
        verify(aiModelClient).generateForReview(
                eq(SectionCitationReviewPrompt.SYSTEM),
                argThat(prompt -> prompt.contains("Previous output was invalid")));
    }

    @Test
    void runRejectsAmbiguousExcerptInsteadOfGuessingOffset() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        String excerpt = "The method improves recall";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction",
                excerpt + ". Later, " + excerpt + ".");
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"UNSUBSTANTIATED_CLAIM",
                          "excerpt":"%s",
                          "rationale":"Empirical claim without citation.",
                          "confidence":"MEDIUM",
                          "evidence":[]
                        }]}
                        """, sectionId, excerpt)));

        assertThatThrownBy(() -> service().run(
                documentId, projectId, sectionId, service().reviewInputFingerprint(section), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
        verify(aiModelClient, times(2)).generateForReview(anyString(), anyString());
    }

    @Test
    void runSuppressesUnsubstantiatedClaimAlreadyFollowedByCitation() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        String excerpt = "The proposed method improves recall by exactly 34 percent over the Alpha baseline";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction",
                excerpt + " \\cite{smith2024}.");
        User actor = new User();
        actor.setId(actorId);
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"UNSUBSTANTIATED_CLAIM",
                          "excerpt":"%s",
                          "rationale":"The model overlooked the adjacent citation.",
                          "confidence":"LOW",
                          "evidence":[]
                        }]}
                        """, sectionId, excerpt)));

        SectionCitationReviewService service = service();
        SectionCitationReviewResponse result = service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), actorId);

        assertThat(result.complete()).isTrue();
        assertThat(result.findings()).isEmpty();
        assertThat(result.summary()).startsWith("No unsubstantiated claims");
    }

    @Test
    void runReturnsValidCachedSnapshotWithoutCallingAiAgain() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", "Saved content for cache lookup.");
        SectionCitationReviewService service = service();
        String fingerprint = service.reviewInputFingerprint(section);
        SectionCitationReviewResponse cached = new SectionCitationReviewResponse(
                "section-critique-v3",
                "critique-rules-v2",
                sectionId,
                section.getVersion(),
                fingerprint,
                service.sectionContentFingerprint(section),
                LocalDateTime.of(2026, 8, 11, 10, 30),
                "cached-provider",
                "cached-model",
                true,
                "Cached review",
                List.of(),
                List.of());
        ReviewSnapshot snapshot = new ReviewSnapshot();
        snapshot.setResponseJson(objectMapper.writeValueAsString(cached));
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(snapshotRepository.findByProjectIdAndStyleAndInputFingerprint(
                eq(projectId), anyString(), eq(fingerprint))).thenReturn(Optional.of(snapshot));

        SectionCitationReviewResponse result = service.run(
                documentId, projectId, sectionId, fingerprint, UUID.randomUUID());

        assertThat(result).isEqualTo(cached);
        verify(aiModelClient, never()).generateForReview(anyString(), anyString());
        verify(sourceMatchingService, never()).search(any(), any(), anyInt());
        verify(snapshotRepository, never()).save(any(ReviewSnapshot.class));
        verifyNoInteractions(auditService);
    }

    @Test
    void responseReadsLegacyContentFingerprintAsReviewInputFingerprint() throws Exception {
        SectionCitationReviewResponse response = objectMapper.readValue(
                "{\"contentFingerprint\":\"legacy-input\",\"findings\":[],\"limitations\":[]}",
                SectionCitationReviewResponse.class);

        assertThat(response.reviewInputFingerprint()).isEqualTo("legacy-input");
        assertThat(response.sectionContentFingerprint()).isNull();
    }

    @Test
    void runKeepsSuccessfulChunksWhenLaterChunkProviderCallFails() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", "x".repeat(8_100));
        User actor = new User();
        actor.setId(actorId);
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString()))
                .thenReturn(new AiModelClient.GenerationResult(
                        "provider", "model", String.format(
                                "{\"section_id\":\"%s\",\"chunk_index\":0,\"findings\":[]}",
                                sectionId)))
                .thenThrow(new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE, "provider unavailable"));

        SectionCitationReviewService service = service();
        List<String> progress = new java.util.ArrayList<>();
        SectionCitationReviewResponse result = service.run(
                documentId,
                projectId,
                sectionId,
                service.reviewInputFingerprint(section),
                actorId,
                (current, total) -> progress.add(current + "/" + total));

        assertThat(result.complete()).isFalse();
        assertThat(result.provider()).isEqualTo("provider");
        assertThat(result.limitations()).singleElement().asString().contains("Chunk 2/2");
        assertThat(progress).containsExactly("0/2", "1/2", "2/2");
        verify(aiModelClient, times(2)).generateForReview(anyString(), anyString());
        verify(snapshotRepository).save(any(ReviewSnapshot.class));
    }

    @Test
    void runDeduplicatesTheSameFindingAcrossChunkOverlap() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        String excerpt = "The external benchmark reports exactly 90 percent accuracy";
        int excerptStart = 7_700;
        String content = "x".repeat(excerptStart - 2) + ". " + excerpt + ". " + "y".repeat(900);
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", content);
        User actor = new User();
        actor.setId(actorId);
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(sourceMatchingService.search(eq(projectId), any(), eq(5))).thenReturn(List.of());
        when(aiModelClient.generateForReview(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":0,"findings":[{
                          "type":"UNSUBSTANTIATED_CLAIM","excerpt":"%s",
                          "rationale":"No supporting source.","confidence":"MEDIUM","evidence":[]
                        }]}
                        """, sectionId, excerpt)),
                new AiModelClient.GenerationResult("provider", "model", String.format("""
                        {"section_id":"%s","chunk_index":1,"findings":[{
                          "type":"UNSUBSTANTIATED_CLAIM","excerpt":"%s",
                          "rationale":"No supporting source.","confidence":"MEDIUM","evidence":[]
                        }]}
                        """, sectionId, excerpt)));

        SectionCitationReviewService service = service();
        SectionCitationReviewResponse result = service.run(
                documentId, projectId, sectionId, service.reviewInputFingerprint(section), actorId);

        assertThat(result.complete()).isTrue();
        assertThat(result.findings()).singleElement().satisfies(finding -> {
            assertThat(finding.startOffset()).isEqualTo(excerptStart);
            assertThat(finding.endOffset()).isEqualTo(excerptStart + excerpt.length());
        });
        verify(aiModelClient, times(2)).generateForReview(anyString(), anyString());
    }

    @Test
    void sourceMatchesRejectsFindingThatNoLongerMatchesSavedOffsets() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        String prefix = "Updated prefix. ";
        String excerpt = "The external benchmark reports 90 percent accuracy";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", prefix + excerpt + ".");
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        SectionReviewSourceMatchRequest request = new SectionReviewSourceMatchRequest(List.of(
                new SectionReviewSourceMatchRequest.Finding(
                        0, excerpt, prefix.length() - 1, prefix.length() - 1 + excerpt.length())));

        assertThatThrownBy(() -> service().sourceMatches(documentId, sectionId, request))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));
        verify(sourceMatchingService, never()).search(any(), any(), anyInt());
    }

    @Test
    void sourceMatchesReturnsCleanCandidateList() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        String excerpt = "The external benchmark reports 90 percent accuracy";
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", excerpt + ".");
        UUID firstSourceId = UUID.randomUUID();
        UUID secondSourceId = UUID.randomUUID();
        UUID thirdSourceId = UUID.randomUUID();
        UUID fourthSourceId = UUID.randomUUID();
        List<SourceMatchingService.SourceMatch> candidates = List.of(
                new SourceMatchingService.SourceMatch(
                        sourceChunk(firstSourceId, UUID.randomUUID(),
                                "# Paper title\n## Threats to validity\n\nfirst"), 0.99f),
                new SourceMatchingService.SourceMatch(
                        sourceChunk(firstSourceId, UUID.randomUUID(), "duplicate source"), 0.98f),
                new SourceMatchingService.SourceMatch(
                        sourceChunk(secondSourceId, UUID.randomUUID(), "second"), 0.90f),
                new SourceMatchingService.SourceMatch(
                        sourceChunk(thirdSourceId, UUID.randomUUID(), "third"), 0.80f),
                new SourceMatchingService.SourceMatch(
                        sourceChunk(fourthSourceId, UUID.randomUUID(), "fourth"), 0.70f));
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(sourceMatchingService.search(eq(projectId), eq(List.of(excerpt)), eq(20)))
                .thenReturn(List.of(candidates));
        SectionReviewSourceMatchRequest request = new SectionReviewSourceMatchRequest(List.of(
                new SectionReviewSourceMatchRequest.Finding(
                        7, excerpt, 0, excerpt.length())));

        SectionReviewSourceMatchesResponse result =
                service().sourceMatches(documentId, sectionId, request);

        assertThat(result.findings()).singleElement().satisfies(matches -> {
            assertThat(matches.findingIndex()).isEqualTo(7);
            assertThat(matches.candidates())
                    .extracting(SectionReviewSourceMatchesResponse.SourceCandidate::documentId)
                    .containsExactly(firstSourceId, secondSourceId, thirdSourceId);
            assertThat(matches.candidates().getFirst().excerpt()).isEqualTo("first");
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"Abstract", "References", "Works Cited"})
    void runExemptsPolicySectionsWithoutCallingAi(String sectionTitle) {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        PaperSection section = section(
                projectId, documentId, sectionId, sectionTitle,
                "This paper presents a retrieval-augmented critique pipeline.");
        User actor = new User();
        actor.setId(actorId);
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));

        SectionCitationReviewResponse result = service().run(
                documentId, projectId, sectionId,
                service().reviewInputFingerprint(section), actorId);

        assertThat(result.complete()).isTrue();
        assertThat(result.findings()).isEmpty();
        assertThat(result.summary()).containsAnyOf("exempt", "not applicable");
        verify(aiModelClient, never()).generateForReview(anyString(), anyString());
        verify(sourceMatchingService, never()).search(any(), any(), anyInt());
        verify(snapshotRepository).save(any(ReviewSnapshot.class));
    }

    @Test
    void runRejectsStaleReviewInputFingerprintBeforeCallingAi() {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        PaperSection section = section(
                projectId, documentId, sectionId, "Introduction", "Saved content");
        when(sectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));

        assertThatThrownBy(() -> service().run(
                documentId, projectId, sectionId, "stale", UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));
        verify(aiModelClient, never()).generateForReview(anyString(), anyString());
    }

    @Test
    void fingerprintChangesWhenSectionTitleChanges() {
        PaperSection section = section(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "Introduction", "The same saved content");
        SectionCitationReviewService service = service();
        String introductionFingerprint = service.reviewInputFingerprint(section);
        String contentFingerprint = service.sectionContentFingerprint(section);

        section.setSectionTitle("Results");

        assertThat(service.reviewInputFingerprint(section))
                .isNotEqualTo(introductionFingerprint);
        assertThat(service.sectionContentFingerprint(section)).isEqualTo(contentFingerprint);
    }

    @Test
    void fingerprintChangesWhenSourceCorpusChanges() {
        UUID projectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        PaperSection section = section(
                projectId, UUID.randomUUID(), UUID.randomUUID(),
                "Introduction", "The same saved content");
        Document source = new Document();
        source.setId(sourceId);
        source.setFileHashSha256("source-hash");
        source.setChunkCount(1);
        source.setProcessedAt(LocalDateTime.of(2026, 8, 21, 10, 0));
        when(sourceMatchingService.retrievableSources(projectId)).thenReturn(List.of(source));
        SectionCitationReviewService service = service();
        String originalCorpusFingerprint = service.reviewInputFingerprint(section);
        String contentFingerprint = service.sectionContentFingerprint(section);

        source.setProcessedAt(LocalDateTime.of(2026, 8, 21, 10, 1));

        assertThat(service.reviewInputFingerprint(section))
                .isNotEqualTo(originalCorpusFingerprint);
        assertThat(service.sectionContentFingerprint(section)).isEqualTo(contentFingerprint);
    }

    private SectionCitationReviewService service() {
        return new SectionCitationReviewService(
                aiModelClient,
                sectionRepository,
                snapshotRepository,
                userRepository,
                new PaperStandardService(mock(AiModelClient.class), objectMapper),
                sourceMatchingService,
                auditService,
                objectMapper);
    }

    private static DocumentChunk sourceChunk(UUID sourceId, UUID chunkId, String text) {
        Document source = new Document();
        source.setId(sourceId);
        source.setTitle("Smith et al. 2024");
        source.setOriginalFilename("smith-et-al.pdf");
        DocumentChunk chunk = mock(DocumentChunk.class);
        when(chunk.getId()).thenReturn(chunkId);
        when(chunk.getText()).thenReturn(text);
        when(chunk.getDocument()).thenReturn(source);
        return chunk;
    }

    private static PaperSection section(
            UUID projectId,
            UUID documentId,
            UUID sectionId,
            String title,
            String content) {
        Project project = new Project();
        project.setId(projectId);
        project.setTargetStandard(PaperStandard.IEEE);
        Document document = new Document();
        document.setId(documentId);
        document.setProject(project);
        document.setDocType(DocumentType.PAPER);
        document.setActive(true);
        PaperSection section = new PaperSection();
        section.setId(sectionId);
        section.setDocument(document);
        section.setSectionTitle(title);
        section.setContentTex(content);
        section.setVersion(2);
        section.setActive(true);
        return section;
    }
}
