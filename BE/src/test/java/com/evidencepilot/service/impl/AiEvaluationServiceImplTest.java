package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.SectionReviewSourceMatchRequest;
import com.evidencepilot.dto.response.SectionCitationReviewResponse;
import com.evidencepilot.dto.response.SectionReviewSourceMatchesResponse;
import com.evidencepilot.model.AiEvaluationJob;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ReviewGuide;
import com.evidencepilot.repository.AiEvaluationJobRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ReviewGuideRepository;
import com.evidencepilot.service.AiModelClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiEvaluationServiceImplTest {

    private final AiEvaluationJobRepository jobRepository = mock(AiEvaluationJobRepository.class);
    private final PaperSectionRepository paperSectionRepository = mock(PaperSectionRepository.class);
    private final SectionCitationReviewService sectionCitationReviewService = mock(SectionCitationReviewService.class);
    private final ReviewGuideRepository reviewGuideRepository = mock(ReviewGuideRepository.class);
    private final AiModelClient aiModelClient = mock(AiModelClient.class);
    private final RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final EvidenceTraceService evidenceTraceService = mock(EvidenceTraceService.class);

    private AiEvaluationServiceImpl service() {
        return new AiEvaluationServiceImpl(
                jobRepository, paperSectionRepository, sectionCitationReviewService,
                reviewGuideRepository, aiModelClient,
                rabbitTemplate, objectMapper, evidenceTraceService);
    }

    @Test
    void process_invalidPayload_marksFailedWithError() {
        UUID jobId = UUID.randomUUID();
        AiEvaluationJob job = job(UUID.randomUUID(), UUID.randomUUID(), "not-json");
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));

        service().process(jobId);

        assertThat(job.getStatus()).isEqualTo(AiEvaluationJob.STATUS_FAILED);
        assertThat(job.getErrorMessage()).isNotBlank();
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test
    void process_alreadyProcessedJob_isSkipped() {
        UUID jobId = UUID.randomUUID();
        AiEvaluationJob job = job(UUID.randomUUID(), UUID.randomUUID(), "{\"x\":1}");
        job.setStatus(AiEvaluationJob.STATUS_SUCCESS);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));

        service().process(jobId);

        assertThat(job.getStatus()).isEqualTo(AiEvaluationJob.STATUS_SUCCESS);
    }

    @Test
    void submit_persistsPendingJobAndPublishes() {
        UUID projectId = UUID.randomUUID();
        when(jobRepository.save(any(AiEvaluationJob.class))).thenAnswer(invocation -> {
            AiEvaluationJob job = invocation.getArgument(0);
            job.setId(UUID.randomUUID());
            return job;
        });

        var response = service().submit(projectId, AiEvaluationJob.KIND_SECTION_CITATION_REVIEW, "{\"x\":1}");

        assertThat(response.jobId()).isNotNull();
        verify(rabbitTemplate).convertAndSend(
                eq(com.evidencepilot.config.infrastructure.RabbitMQConfig.AI_EVALUATION_QUEUE),
                any(Map.class));
    }

    @Test
    void submitSectionCitationReview_publishes() {
        UUID projectId = UUID.randomUUID();
        when(jobRepository.findByProjectIdAndKindAndStatusInOrderByCreatedAtDesc(
                eq(projectId),
                eq(AiEvaluationJob.KIND_SECTION_CITATION_REVIEW),
                any())).thenReturn(List.of());
        when(jobRepository.save(any(AiEvaluationJob.class))).thenAnswer(invocation -> {
            AiEvaluationJob job = invocation.getArgument(0);
            job.setId(UUID.randomUUID());
            return job;
        });

        var response = service().submitSectionCitationReview(
                projectId, UUID.randomUUID(), UUID.randomUUID(), "fingerprint", UUID.randomUUID());

        assertThat(response.jobId()).isNotNull();
        verify(rabbitTemplate).convertAndSend(
                eq(com.evidencepilot.config.infrastructure.RabbitMQConfig.AI_EVALUATION_QUEUE),
                any(Map.class));
    }

    @Test
    void submitSectionCitationReview_reusesMatchingActiveJob() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        UUID existingJobId = UUID.randomUUID();
        AiEvaluationJob existing = job(
                sectionId,
                projectId,
                objectMapper.writeValueAsString(Map.of(
                        "documentId", documentId,
                        "projectId", projectId,
                        "sectionId", sectionId,
                        "contentFingerprint", "fingerprint",
                        "requestedByUserId", requesterId)));
        existing.setId(existingJobId);
        when(jobRepository.findByProjectIdAndKindAndStatusInOrderByCreatedAtDesc(
                eq(projectId),
                eq(AiEvaluationJob.KIND_SECTION_CITATION_REVIEW),
                any())).thenReturn(List.of(existing));

        var response = service().submitSectionCitationReview(
                projectId, documentId, sectionId, "fingerprint", requesterId);

        assertThat(response.jobId()).isEqualTo(existingJobId);
        verify(jobRepository, never()).save(any(AiEvaluationJob.class));
        verify(rabbitTemplate, never()).convertAndSend(
                eq(com.evidencepilot.config.infrastructure.RabbitMQConfig.AI_EVALUATION_QUEUE),
                any(Map.class));
    }

    @Test
    void process_sectionCitationReview_runsSectionReview() throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        AiEvaluationJob job = job(
                sectionId,
                projectId,
                objectMapper.writeValueAsString(Map.of(
                        "documentId", documentId,
                        "projectId", projectId,
                        "sectionId", sectionId,
                        "contentFingerprint", "fingerprint",
                        "requestedByUserId", requesterId)));
        job.setKind(AiEvaluationJob.KIND_SECTION_CITATION_REVIEW);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));
        when(sectionCitationReviewService.run(
                eq(documentId), eq(projectId), eq(sectionId), eq("fingerprint"), eq(requesterId), any()))
                .thenAnswer(invocation -> {
                    BiConsumer<Integer, Integer> progress = invocation.getArgument(5);
                    progress.accept(2, 9);
                    return new SectionCitationReviewResponse(
                            "section-citation-v1",
                            "citation-rules-v1",
                            sectionId,
                            1,
                            "fingerprint",
                            LocalDateTime.now(),
                            "provider",
                            "model",
                            true,
                            "Done",
                            List.of(),
                            List.of());
                });
        when(evidenceTraceService.materialize(
                eq(documentId), eq(sectionId), eq(requesterId), any(SectionCitationReviewResponse.class)))
                .thenReturn(new EvidenceTraceService.RoundMaterialization(
                        UUID.randomUUID(), null, false));

        service().process(jobId);

        assertThat(job.getStatus()).isEqualTo(AiEvaluationJob.STATUS_SUCCESS);
        assertThat(job.getResultJson()).contains("section-citation-v1");
        assertThat(job.getProgressCurrent()).isEqualTo(2);
        assertThat(job.getProgressTotal()).isEqualTo(9);
        var response = service().getJob(jobId);
        assertThat(response.progressCurrent()).isEqualTo(2);
        assertThat(response.progressTotal()).isEqualTo(9);
        verify(jobRepository).updateProgress(job.getId(), 2, 9);
        verify(sectionCitationReviewService).run(
                eq(documentId), eq(projectId), eq(sectionId), eq("fingerprint"), eq(requesterId), any());
        verify(evidenceTraceService, never()).recheck(any(), any(), any());
    }

    @Test
    void process_sourceMatches_deserializesFindingsPayload() throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        var finding = new SectionReviewSourceMatchRequest.Finding(0, "Supported claim", 0, 15);
        var request = new SectionReviewSourceMatchRequest(List.of(finding));
        AiEvaluationJob job = job(
                sectionId,
                projectId,
                objectMapper.writeValueAsString(Map.of(
                        "projectId", projectId,
                        "documentId", documentId,
                        "sectionId", sectionId,
                        "findings", request.findings())));
        job.setKind(AiEvaluationJob.KIND_SOURCE_MATCHES);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));
        when(sectionCitationReviewService.sourceMatches(documentId, sectionId, request))
                .thenReturn(new SectionReviewSourceMatchesResponse(List.of(
                        new SectionReviewSourceMatchesResponse.FindingMatches(0, List.of()))));

        service().process(jobId);

        assertThat(job.getStatus()).isEqualTo(AiEvaluationJob.STATUS_SUCCESS);
        assertThat(job.getResultJson()).contains("\"findingIndex\":0");
        verify(sectionCitationReviewService).sourceMatches(documentId, sectionId, request);
    }

    @Test
    void process_sectionCitationReviewQueuesTraceRecheckAsSeparateJob() throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        UUID previousRoundId = UUID.randomUUID();
        UUID linkedRoundId = UUID.randomUUID();
        AiEvaluationJob job = job(
                sectionId,
                projectId,
                objectMapper.writeValueAsString(Map.of(
                        "documentId", documentId,
                        "projectId", projectId,
                        "sectionId", sectionId,
                        "contentFingerprint", "fingerprint",
                        "requestedByUserId", requesterId)));
        job.setKind(AiEvaluationJob.KIND_SECTION_CITATION_REVIEW);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));
        when(jobRepository.save(any(AiEvaluationJob.class))).thenAnswer(invocation -> {
            AiEvaluationJob saved = invocation.getArgument(0);
            if (saved.getId() == null) saved.setId(UUID.randomUUID());
            return saved;
        });
        when(sectionCitationReviewService.run(
                eq(documentId), eq(projectId), eq(sectionId), eq("fingerprint"), eq(requesterId), any()))
                .thenReturn(new SectionCitationReviewResponse(
                        "section-citation-v1",
                        "citation-rules-v1",
                        sectionId,
                        1,
                        "fingerprint",
                        LocalDateTime.now(),
                        "provider",
                        "model",
                        true,
                        "Done",
                        List.of(),
                        List.of()));
        when(evidenceTraceService.materialize(
                eq(documentId), eq(sectionId), eq(requesterId), any(SectionCitationReviewResponse.class)))
                .thenReturn(new EvidenceTraceService.RoundMaterialization(
                        linkedRoundId, previousRoundId, true));

        service().process(jobId);

        assertThat(job.getStatus()).isEqualTo(AiEvaluationJob.STATUS_SUCCESS);
        verify(jobRepository).save(argThat(saved ->
                AiEvaluationJob.KIND_TRACE_RECHECK.equals(saved.getKind())
                        && saved.getPayloadJson().contains(previousRoundId.toString())
                        && saved.getPayloadJson().contains(linkedRoundId.toString())));
        verify(rabbitTemplate).convertAndSend(
                eq(com.evidencepilot.config.infrastructure.RabbitMQConfig.AI_EVALUATION_QUEUE),
                any(Map.class));
        verify(evidenceTraceService, never()).recheck(any(), any(), any());
    }

    @Test
    void process_traceRecheckFailureMarksOnlyRecheckJobFailed() throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID previousRoundId = UUID.randomUUID();
        UUID linkedRoundId = UUID.randomUUID();
        AiEvaluationJob job = job(
                UUID.randomUUID(),
                projectId,
                objectMapper.writeValueAsString(Map.of(
                        "projectId", projectId,
                        "previousRoundId", previousRoundId,
                        "linkedRoundId", linkedRoundId)));
        job.setKind(AiEvaluationJob.KIND_TRACE_RECHECK);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));
        when(evidenceTraceService.recheck(projectId, previousRoundId, linkedRoundId))
                .thenThrow(new AiModelClient.AiApiException("/ai/generate", 503));

        service().process(jobId);

        assertThat(job.getStatus()).isEqualTo(AiEvaluationJob.STATUS_FAILED);
        assertThat(job.getErrorMessage()).contains("503");
        assertThat(job.getCompletedAt()).isNotNull();
        verify(sectionCitationReviewService, never()).run(
                any(), any(), any(), anyString(), any(), any());
    }

    @Test
    void process_sectionCitationReview_keepsHttpStatusPrefixForFrontendErrorMapping() throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        AiEvaluationJob job = job(
                sectionId,
                projectId,
                objectMapper.writeValueAsString(Map.of(
                        "documentId", documentId,
                        "projectId", projectId,
                        "sectionId", sectionId,
                        "contentFingerprint", "fingerprint",
                        "requestedByUserId", requesterId)));
        job.setKind(AiEvaluationJob.KIND_SECTION_CITATION_REVIEW);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));
        when(sectionCitationReviewService.run(
                eq(documentId), eq(projectId), eq(sectionId), eq("fingerprint"), eq(requesterId), any()))
                .thenThrow(new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY, "AI returned an invalid section citation review"));

        service().process(jobId);

        assertThat(job.getStatus()).isEqualTo(AiEvaluationJob.STATUS_FAILED);
        assertThat(job.getErrorMessage()).startsWith("502");
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"array", "object", "wrapper", "unsubstantiated-without-evidence"})
    void process_sectionSuggestion_acceptsSupportedJsonShapes(String shape) throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        String studentText = "Our proposed retrieval-augmented citation engine improves answer accuracy by 34% "
                + "and reduces latency by 47% compared to the previous version, while cutting token cost per "
                + "query by a factor of 3.2. The method also outperforms all baselines on the task by 12.5 points.";
        String issue = "The student text makes a claim about a retrieval-augmented citation engine improving "
                + "answer accuracy by 34% and reducing latency by 47%, which is completely unrelated to the "
                + "biological study described and unsupported by any evidence in the retrieved chunks.";
        String actionableFix = "Remove the paragraph describing the retrieval-augmented citation engine "
                + "performance metrics, as it is irrelevant to the Results section of a single-nucleus RNA-seq "
                + "study of human adipose tissue.";
        String evidenceQuote = "We perform dimensionality reduction on the correlated HVGs to check if there "
                + "is any substructure. Cells separate into clear clusters in the t-SNE plot (Figure 23), "
                + "corresponding to distinct subpopulations. This is consistent with the presence of multiple "
                + "cell types in the diverse brain population.";
        AiEvaluationJob job = job(sectionId, projectId, objectMapper.writeValueAsString(Map.of(
                "projectId", projectId,
                "documentId", documentId,
                "sectionId", sectionId,
                "sectionType", "Introduction")));
        job.setKind(AiEvaluationJob.KIND_SECTION_SUGGESTION);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));
        PaperSection section = new PaperSection();
        section.setId(sectionId);
        section.setSectionTitle("Introduction");
        section.setContentTex(studentText);
        Document document = new Document();
        document.setId(documentId);
        Project project = new Project();
        project.setId(projectId);
        document.setProject(project);
        section.setDocument(document);
        when(paperSectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        ReviewGuide guide = new ReviewGuide();
        guide.setSectionType("Introduction");
        guide.setChecklistJson("[\"Is the research question stated?\"]");
        when(reviewGuideRepository.findById("Introduction")).thenReturn(Optional.of(guide));
        boolean withoutEvidence = "unsubstantiated-without-evidence".equals(shape);
        when(sectionCitationReviewService.retrieveEvidence(
                projectId, section.getContentTex())).thenReturn(withoutEvidence
                        ? List.of()
                        : List.of(new SectionCitationReviewService.RetrievedEvidence(
                                sourceId,
                                chunkId,
                                "source-key",
                                "Source title",
                                evidenceQuote)));
        var suggestionNode = objectMapper.createObjectNode();
        suggestionNode.put("type", "UNSUBSTANTIATED_CLAIM");
        suggestionNode.put("issue", issue);
        suggestionNode.put("quote", studentText);
        suggestionNode.put("actionable_fix", actionableFix);
        var evidenceNode = suggestionNode.putObject("evidence");
        if (withoutEvidence) {
            evidenceNode.putNull("chunk_id");
            evidenceNode.putNull("source_id");
            evidenceNode.putNull("quote");
        } else {
            evidenceNode.put("chunk_id", chunkId.toString());
            evidenceNode.put("source_id", sourceId.toString());
            evidenceNode.put("quote", evidenceQuote);
        }
        String suggestion = objectMapper.writeValueAsString(suggestionNode);
        String response = switch (shape) {
            case "array" -> "```json\n[" + suggestion + "]\n```\n trailing";
            case "object" -> suggestion;
            case "wrapper" -> "{\"suggestions\":[" + suggestion + "]}";
            case "unsubstantiated-without-evidence" -> "{\"suggestions\":[" + suggestion + "]}";
            default -> throw new IllegalArgumentException("Unknown test shape: " + shape);
        };
        when(aiModelClient.generate(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", response));

        service().process(jobId);

        assertThat(job.getStatus()).isEqualTo(AiEvaluationJob.STATUS_SUCCESS);
        assertThat(issue.length()).isGreaterThan(200).isLessThanOrEqualTo(300);
        var result = objectMapper.readTree(job.getResultJson());
        assertThat(result.isArray()).isTrue();
        assertThat(result).hasSize(1);
        assertThat(result.get(0).path("type").asText()).isEqualTo("UNSUBSTANTIATED_CLAIM");
        verify(aiModelClient).generate(anyString(), anyString());
        verify(reviewGuideRepository).findById("Introduction");
    }

    @ParameterizedTest
    @ValueSource(strings = {"refusal", "unknown-type", "long-issue", "source-discrepancy-without-evidence"})
    void process_sectionSuggestion_invalidOutput_marksFailed(String invalidCase) throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        AiEvaluationJob job = job(sectionId, projectId, objectMapper.writeValueAsString(Map.of(
                "projectId", projectId,
                "documentId", documentId,
                "sectionId", sectionId,
                "sectionType", "Introduction")));
        job.setKind(AiEvaluationJob.KIND_SECTION_SUGGESTION);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));
        PaperSection section = new PaperSection();
        section.setId(sectionId);
        section.setSectionTitle("Introduction");
        section.setContentTex("Some content");
        Document document = new Document();
        document.setId(documentId);
        Project project = new Project();
        project.setId(projectId);
        document.setProject(project);
        section.setDocument(document);
        when(paperSectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        ReviewGuide guide = new ReviewGuide();
        guide.setSectionType("Introduction");
        guide.setChecklistJson("[\"Is the research question stated?\"]");
        when(reviewGuideRepository.findById("Introduction")).thenReturn(Optional.of(guide));
        String response = switch (invalidCase) {
            case "refusal" -> "I cannot fulfill this request.";
            case "unknown-type" -> """
                    {"type":"NOT_REAL","issue":"Gap","quote":"Some content",
                     "actionable_fix":"Fix it.","evidence":null}
                    """;
            case "long-issue" -> """
                    {"type":"CLARITY","issue":"%s","quote":"Some content",
                     "actionable_fix":"Fix it.","evidence":null}
                    """.formatted("x".repeat(301));
            case "source-discrepancy-without-evidence" -> """
                    {"type":"SOURCE_DISCREPANCY","issue":"Gap","quote":"Some content",
                     "actionable_fix":"Fix it.","evidence":null}
                    """;
            default -> throw new IllegalArgumentException("Unknown invalid case: " + invalidCase);
        };
        when(aiModelClient.generate(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("provider", "model", response));

        service().process(jobId);

        assertThat(job.getStatus()).isEqualTo(AiEvaluationJob.STATUS_FAILED);
        assertThat(job.getErrorMessage()).startsWith("502");
        assertThat(job.getResultJson()).isNull();
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test
    void process_sectionSuggestion_preservesUpstreamAiStatus() throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        AiEvaluationJob job = job(sectionId, projectId, objectMapper.writeValueAsString(Map.of(
                "projectId", projectId,
                "documentId", documentId,
                "sectionId", sectionId,
                "sectionType", "Introduction")));
        job.setKind(AiEvaluationJob.KIND_SECTION_SUGGESTION);
        when(jobRepository.findById(jobId)).thenReturn(Optional.of(job));
        PaperSection section = new PaperSection();
        section.setId(sectionId);
        section.setSectionTitle("Introduction");
        section.setContentTex("Some content");
        Document document = new Document();
        document.setId(documentId);
        Project project = new Project();
        project.setId(projectId);
        document.setProject(project);
        section.setDocument(document);
        when(paperSectionRepository.findByIdWithDocument(sectionId)).thenReturn(Optional.of(section));
        ReviewGuide guide = new ReviewGuide();
        guide.setSectionType("Introduction");
        guide.setChecklistJson("[\"Is the research question stated?\"]");
        when(reviewGuideRepository.findById("Introduction")).thenReturn(Optional.of(guide));
        when(aiModelClient.generate(anyString(), anyString()))
                .thenThrow(new AiModelClient.AiApiException("/ai/generate", 429));

        service().process(jobId);

        assertThat(job.getStatus()).isEqualTo(AiEvaluationJob.STATUS_FAILED);
        assertThat(job.getErrorMessage()).contains("429");
        assertThat(job.getErrorMessage()).doesNotContain("invalid section suggestions");
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test
    void reenqueuePendingJobs_publishesEachPendingJob() {
        UUID jobId = UUID.randomUUID();
        AiEvaluationJob pending = job(UUID.randomUUID(), UUID.randomUUID(), "{\"x\":1}");
        pending.setId(jobId);
        when(jobRepository.findByStatus(AiEvaluationJob.STATUS_PENDING)).thenReturn(List.of(pending));

        service().reenqueuePendingJobs();

        verify(rabbitTemplate).convertAndSend(
                com.evidencepilot.config.infrastructure.RabbitMQConfig.AI_EVALUATION_QUEUE,
                Map.of("jobId", jobId.toString()));
    }

    private AiEvaluationJob job(UUID sectionId, UUID projectId, String payloadJson) {
        AiEvaluationJob job = new AiEvaluationJob();
        job.setId(UUID.randomUUID());
        job.setProjectId(projectId);
        job.setKind(AiEvaluationJob.KIND_SECTION_CITATION_REVIEW);
        job.setPayloadJson(payloadJson);
        job.setStatus(AiEvaluationJob.STATUS_PENDING);
        return job;
    }
}
