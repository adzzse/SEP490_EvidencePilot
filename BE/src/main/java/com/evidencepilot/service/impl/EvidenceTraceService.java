package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.TraceDecisionRequest;
import com.evidencepilot.dto.request.TraceReviewRequest;
import com.evidencepilot.dto.response.EvidenceTraceResponse;
import com.evidencepilot.dto.response.SectionCitationReviewResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.CitationReviewRound;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.EvidenceRevisionTrace;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.InstructorJudgment;
import com.evidencepilot.model.enums.StudentAction;
import com.evidencepilot.model.enums.TraceOutcome;
import com.evidencepilot.prompt.TraceRecheckPrompt;
import com.evidencepilot.repository.CitationReviewRoundRepository;
import com.evidencepilot.repository.DocumentChunkRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.CurrentUserService;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class EvidenceTraceService {

    private static final int PASSAGE_RADIUS = 120;
    private static final int EVIDENCE_TEXT_LIMIT = 1_200;

    private final CitationReviewRoundRepository roundRepository;
    private final EvidenceRevisionTraceRepository traceRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final UserRepository userRepository;
    private final DocumentRepository documentRepository;
    private final DocumentChunkRepository documentChunkRepository;
    private final SectionCitationReviewService sectionCitationReviewService;
    private final AiModelClient aiModelClient;
    private final CurrentUserService currentUserService;
    private final ObjectMapper objectMapper;

    @Transactional
    public RoundMaterialization materialize(
            UUID documentId,
            UUID sectionId,
            UUID requestedByUserId,
            SectionCitationReviewResponse review) {
        PaperSection section = paperSectionRepository.findByIdWithDocument(sectionId)
                .filter(found -> documentId.equals(found.getDocument().getId()))
                .filter(PaperSection::isActive)
                .orElseThrow(() -> new ResourceNotFoundException(sectionId, "PaperSection"));
        String currentReviewInputFingerprint =
                sectionCitationReviewService.reviewInputFingerprint(section);
        String currentSectionContentFingerprint =
                sectionCitationReviewService.sectionContentFingerprint(section);
        if (!Objects.equals(
                        currentReviewInputFingerprint, review.reviewInputFingerprint())
                || (review.sectionContentFingerprint() != null
                        && !Objects.equals(
                                currentSectionContentFingerprint,
                                review.sectionContentFingerprint()))) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "SECTION_REVIEW_INPUT_CHANGED: run Citation Review again");
        }
        CitationReviewRound previousRound = roundRepository
                .findFirstBySectionIdOrderByCreatedAtDesc(sectionId)
                .orElse(null);
        User requestedBy = userRepository.findById(requestedByUserId)
                .orElseThrow(() -> new ResourceNotFoundException(requestedByUserId, "User"));
        CitationReviewRound round = new CitationReviewRound();
        round.setProject(section.getDocument().getProject());
        round.setSection(section);
        round.setSectionVersion(section.getVersion());
        round.setRequestedBy(requestedBy);
        round.setReviewInputFingerprint(currentReviewInputFingerprint);
        round.setSectionContentFingerprint(currentSectionContentFingerprint);
        round.setStyle(review.reviewVersion());
        round.setGenerationMeta(generationMeta(review));
        round.setSummary(review.summary());
        round.setComplete(review.complete());
        round.setCreatedAt(LocalDateTime.now());
        round = roundRepository.save(round);

        List<EvidenceRevisionTrace> traces = new ArrayList<>();
        for (int index = 0; index < review.findings().size(); index++) {
            SectionCitationReviewResponse.Finding finding = review.findings().get(index);
            traces.add(toTrace(round, section, index, finding));
        }
        traceRepository.saveAll(traces);
        boolean recheckRequired = previousRound != null
                && traceRepository.findByRoundIdOrderByFindingIndex(previousRound.getId()).stream()
                        .anyMatch(EvidenceTraceService::isRecheckable);
        return new RoundMaterialization(
                round.getId(),
                previousRound == null ? null : previousRound.getId(),
                recheckRequired);
    }

    @Transactional
    public EvidenceTraceResponse decide(
            UUID documentId,
            UUID sectionId,
            UUID traceId,
            TraceDecisionRequest request) {
        EvidenceRevisionTrace trace = traceRepository.findById(traceId)
                .filter(found -> sectionId.equals(found.getSection().getId()))
                .filter(found -> documentId.equals(found.getSection().getDocument().getId()))
                .orElseThrow(() -> new ResourceNotFoundException(traceId, "EvidenceRevisionTrace"));
        if (trace.getJudgment() != null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "TRACE_ALREADY_JUDGED: the instructor judgment locks this trace");
        }
        PaperSection section = trace.getSection();
        String currentFingerprint =
                sectionCitationReviewService.sectionContentFingerprint(section);
        String reviewedContentFingerprint = trace.getRound().getSectionContentFingerprint();
        boolean sectionChanged = reviewedContentFingerprint == null
                ? !sectionCitationReviewService.reviewInputFingerprint(section)
                        .equals(trace.getRound().getReviewInputFingerprint())
                : !currentFingerprint.equals(reviewedContentFingerprint);
        if (request.studentAction() != StudentAction.DISMISS_WITH_REASON
                && !sectionChanged) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "SECTION_NOT_CHANGED: this action requires a saved section revision");
        }
        String revisedPassage = revisedPassage(section, trace, request, sectionChanged);
        trace.setStudentAction(request.studentAction());
        trace.setExplanation(request.explanation().trim());
        if (request.sourceId() != null) {
            trace.setSource(documentRepository.findById(request.sourceId()).orElse(null));
            trace.setSourceReplaced(true);
        }
        if (request.chunkId() != null) {
            trace.setChunk(documentChunkRepository.findById(request.chunkId()).orElse(null));
        }
        trace.setEvidenceQuote(request.evidenceQuote());
        trace.setEvidenceRelation(request.relation());
        trace.setAfterPassage(revisedPassage);
        trace.setAfterFingerprint(currentFingerprint);
        trace.setAfterSectionVersion(section.getVersion());
        LocalDateTime now = LocalDateTime.now();
        trace.setRoundDurationMs(Math.max(0,
                Duration.between(trace.getRound().getCreatedAt(), now).toMillis()));
        trace.setOutcome(sectionChanged ? TraceOutcome.STALE : TraceOutcome.UNRESOLVED);
        return toResponse(traceRepository.save(trace));
    }

    @Transactional
    public void stampStaleOnContentChanged(UUID sectionId, String content, Integer version) {
        String contentFingerprint =
                sectionCitationReviewService.sectionContentFingerprint(content);
        List<EvidenceRevisionTrace> open = traceRepository
                .findBySectionIdOrderByCreatedAtDesc(sectionId).stream()
                .filter(trace -> trace.getOutcome() == null || trace.getOutcome() == TraceOutcome.UNRESOLVED)
                .filter(trace -> trace.getJudgment() == null)
                .toList();
        for (EvidenceRevisionTrace trace : open) {
            trace.setOutcome(TraceOutcome.STALE);
            trace.setAfterPassage(null);
            trace.setAfterFingerprint(contentFingerprint);
            trace.setAfterSectionVersion(version);
        }
        traceRepository.saveAll(open);
    }

    @Transactional
    public int recheck(UUID projectId, UUID previousRoundId, UUID linkedRoundId) {
        CitationReviewRound previousRound = roundRepository.findById(previousRoundId)
                .orElseThrow(() -> new ResourceNotFoundException(previousRoundId, "CitationReviewRound"));
        CitationReviewRound linkedRound = roundRepository.findById(linkedRoundId)
                .orElseThrow(() -> new ResourceNotFoundException(linkedRoundId, "CitationReviewRound"));
        if (!projectId.equals(previousRound.getProject().getId())
                || !projectId.equals(linkedRound.getProject().getId())
                || !previousRound.getSection().getId().equals(linkedRound.getSection().getId())) {
            throw new IllegalArgumentException("Trace recheck rounds must belong to the same project section");
        }
        List<EvidenceRevisionTrace> candidates = traceRepository
                .findByRoundIdOrderByFindingIndex(previousRoundId).stream()
                .filter(EvidenceTraceService::isRecheckable)
                .toList();
        if (candidates.isEmpty()) {
            return 0;
        }

        PaperSection section = linkedRound.getSection();
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("sectionTitle", section.getSectionTitle());
        context.put("traces", candidates.stream().map(trace -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("traceId", trace.getId());
            item.put("excerpt", trace.getExcerpt());
            item.put("rationale", trace.getRationale());
            item.put("evidence", trace.getEvidenceQuote() == null ? "" : trace.getEvidenceQuote());
            item.put("studentAction", trace.getStudentAction().name());
            item.put("studentExplanation", trace.getExplanation());
            item.put("revisedPassage", trace.getAfterPassage());
            return item;
        }).toList());
        String prompt;
        try {
            prompt = objectMapper.writeValueAsString(context);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize trace recheck context", exception);
        }
        AiModelClient.GenerationResult generation = aiModelClient.generateForReview(
                TraceRecheckPrompt.SYSTEM, prompt);
        RecheckBatch batch;
        try {
            batch = recheckMapper().readValue(
                    extractJsonObject(generation.response()), RecheckBatch.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Recheck verdict is not valid JSON", exception);
        }
        List<RecheckVerdict> verdicts = batch.results();
        if (verdicts == null) {
            throw new IllegalArgumentException("Recheck verdict did not contain results");
        }
        if (verdicts.size() != candidates.size()) {
            throw new IllegalArgumentException("Recheck verdict count does not match the trace batch");
        }
        Map<UUID, RecheckVerdict> verdictByTraceId = new LinkedHashMap<>();
        for (RecheckVerdict verdict : verdicts) {
            if (verdict.traceId() == null || verdict.judgment() == null
                    || verdict.reason() == null || verdict.reason().isBlank()
                    || verdict.reason().length() > 400
                    || verdictByTraceId.putIfAbsent(verdict.traceId(), verdict) != null) {
                throw new IllegalArgumentException("Recheck verdict is incomplete or duplicated");
            }
        }
        LocalDateTime recheckedAt = LocalDateTime.now();
        for (EvidenceRevisionTrace trace : candidates) {
            RecheckVerdict verdict = verdictByTraceId.get(trace.getId());
            if (verdict == null) {
                throw new IllegalArgumentException("Recheck verdict referenced a different trace batch");
            }
            trace.setLinkedRound(linkedRound);
            trace.setLinkedMode(CitationReviewRound.LINK_MODE_REVISION_CHAIN);
            trace.setAiRecheckJudgment(verdict.judgment());
            trace.setAiRecheckReason(verdict.reason().trim());
            trace.setAiRecheckedAt(recheckedAt);
        }
        traceRepository.saveAll(candidates);
        return candidates.size();
    }

    @Transactional(readOnly = true)
    public List<EvidenceTraceResponse> listTraces(UUID projectId, TraceOutcome outcome) {
        List<EvidenceRevisionTrace> traces = outcome == null
                ? traceRepository.findByProjectIdOrderByCreatedAtDesc(projectId)
                : traceRepository.findByProjectIdAndOutcomeInOrderByCreatedAtDesc(
                        projectId, List.of(outcome));
        return traces.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<EvidenceTraceResponse> listSectionTraces(UUID documentId, UUID sectionId) {
        PaperSection section = paperSectionRepository.findByIdWithDocument(sectionId)
                .filter(found -> documentId.equals(found.getDocument().getId()))
                .orElseThrow(() -> new ResourceNotFoundException(sectionId, "PaperSection"));
        return traceRepository.findBySectionIdOrderByCreatedAtDesc(section.getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public EvidenceTraceResponse review(UUID projectId, UUID traceId, TraceReviewRequest request) {
        EvidenceRevisionTrace trace = traceRepository.findById(traceId)
                .filter(found -> projectId.equals(found.getRound().getProject().getId()))
                .orElseThrow(() -> new ResourceNotFoundException(traceId, "EvidenceRevisionTrace"));
        User instructor = currentUserService.requireCurrentUser();
        trace.setInstructor(instructor);
        trace.setJudgment(request.judgment());
        trace.setInstructorFeedback(request.instructorFeedback());
        trace.setOutcome(switch (request.judgment()) {
            case EFFECTIVE -> TraceOutcome.RESOLVED;
            case PARTIAL -> TraceOutcome.PARTIALLY_RESOLVED;
            case INEFFECTIVE -> TraceOutcome.UNRESOLVED;
        });
        trace.setJudgedAt(LocalDateTime.now());
        return toResponse(traceRepository.save(trace));
    }

    private EvidenceRevisionTrace toTrace(
            CitationReviewRound round,
            PaperSection section,
            int index,
            SectionCitationReviewResponse.Finding finding) {
        EvidenceRevisionTrace trace = new EvidenceRevisionTrace();
        trace.setRound(round);
        trace.setSection(section);
        trace.setFindingIndex(index);
        trace.setSuggestedAction(suggestedAction(finding.type()));
        trace.setExcerpt(finding.excerpt());
        trace.setExcerptStart(finding.startOffset());
        trace.setExcerptEnd(finding.endOffset());
        trace.setRationale(finding.rationale());
        trace.setConfidence(confidence(finding.confidence()));
        trace.setCreatedAt(LocalDateTime.now());
        SectionCitationReviewResponse.Evidence first = finding.evidence().isEmpty()
                ? null : finding.evidence().getFirst();
        if (first != null) {
            trace.setSource(documentRepository.findById(first.sourceId()).orElse(null));
            trace.setChunk(documentChunkRepository.findById(first.chunkId()).orElse(null));
            trace.setEvidenceQuote(first.quote());
            trace.setEvidenceRelation(first.relation() == null ? null : first.relation().name());
        }
        return trace;
    }

    private String suggestedAction(SectionCitationReviewResponse.FindingType type) {
        return type == SectionCitationReviewResponse.FindingType.UNSUBSTANTIATED_CLAIM
                ? "ADD_CITATION" : "QUALIFY";
    }

    private BigDecimal confidence(SectionCitationReviewResponse.Confidence confidence) {
        if (confidence == null) {
            return null;
        }
        return switch (confidence) {
            case HIGH -> new BigDecimal("1.0000");
            case MEDIUM -> new BigDecimal("0.6000");
            case LOW -> new BigDecimal("0.3000");
        };
    }

    private String generationMeta(SectionCitationReviewResponse review) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                    "reviewVersion", review.reviewVersion(),
                    "ruleCatalogVersion", review.ruleCatalogVersion(),
                    "provider", review.provider() == null ? "" : review.provider(),
                    "model", review.model() == null ? "" : review.model()));
        } catch (JsonProcessingException exception) {
            return null;
        }
    }

    private EvidenceTraceResponse toResponse(EvidenceRevisionTrace trace) {
        String sourceTitle = null;
        Document source = trace.getSource();
        if (source != null) {
            sourceTitle = source.getTitle() == null || source.getTitle().isBlank()
                    ? source.getOriginalFilename() : source.getTitle();
        }
        return new EvidenceTraceResponse(
                trace.getId(),
                trace.getRound().getId(),
                trace.getSection().getId(),
                trace.getSection().getSectionTitle(),
                trace.getSection().getVersion(),
                trace.getFindingIndex(),
                trace.getSuggestedAction(),
                trace.getCriticality(),
                trace.getParentHeader(),
                trace.getExcerpt(),
                trace.getExcerptStart(),
                trace.getExcerptEnd(),
                trace.getRationale(),
                trace.getConfidence(),
                source == null ? null : source.getId(),
                sourceTitle,
                trace.getChunk() == null ? null : trace.getChunk().getId(),
                trace.getEvidenceQuote(),
                trace.getEvidenceRelation(),
                trace.getStudentAction(),
                trace.getExplanation(),
                trace.getAfterPassage(),
                trace.getAfterSectionVersion(),
                trace.getOutcome(),
                trace.getInstructor() == null ? null : trace.getInstructor().getId(),
                trace.getJudgment(),
                trace.getInstructorFeedback(),
                trace.getJudgedAt(),
                trace.getLinkedRound() == null ? null : trace.getLinkedRound().getId(),
                trace.getLinkedMode(),
                trace.getAiRecheckJudgment(),
                trace.getAiRecheckReason(),
                trace.getAiRecheckedAt(),
                trace.getCreatedAt());
    }

    private static String revisedPassage(
            PaperSection section,
            EvidenceRevisionTrace trace,
            TraceDecisionRequest request,
            boolean sectionChanged) {
        if (!Objects.equals(request.sectionVersion(), section.getVersion())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "SECTION_VERSION_CHANGED: reload the section and select the revised passage again");
        }
        String content = section.getContentTex() == null ? "" : section.getContentTex();
        Integer start = request.revisedStartOffset();
        Integer end = request.revisedEndOffset();
        if (start == null || end == null) {
            if (request.studentAction() != StudentAction.DISMISS_WITH_REASON || sectionChanged) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "REVISED_PASSAGE_REQUIRED: select the revised passage in the saved section");
            }
            return passageAround(content, trace.getExcerptStart(), trace.getExcerptEnd());
        }
        if (start < 0 || end < start || end > content.length()
                || (start.equals(end) && request.studentAction() != StudentAction.REMOVE)
                || (request.studentAction() != StudentAction.REMOVE
                        && content.substring(start, end).isBlank())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_REVISED_RANGE: select a valid revised passage in the saved section");
        }
        return passageAround(content, start, end);
    }

    private static boolean isRecheckable(EvidenceRevisionTrace trace) {
        return trace.getStudentAction() != null
                && trace.getAfterPassage() != null
                && !trace.getAfterPassage().isBlank();
    }

    private static String passageAround(String content, int start, int end) {
        if (content == null || content.isBlank()) {
            return "";
        }
        int length = content.length();
        int safeStart = Math.max(0, Math.min(start, length));
        int safeEnd = Math.max(safeStart, Math.min(end, length));
        int from = Math.max(0, safeStart - PASSAGE_RADIUS);
        int to = (int) Math.min(length, (long) safeEnd + PASSAGE_RADIUS);
        String passage = content.substring(from, to);
        return passage.length() > EVIDENCE_TEXT_LIMIT
                ? passage.substring(0, EVIDENCE_TEXT_LIMIT) : passage;
    }

    private ObjectMapper recheckMapper() {
        return objectMapper.copy()
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT);
    }

    private static String extractJsonObject(String response) {
        if (response == null) {
            throw new IllegalArgumentException("Empty AI response");
        }
        String stripped = response.replaceAll("(?s)```(?:json)?|```", "");
        int start = stripped.indexOf('{');
        int end = stripped.lastIndexOf('}');
        if (start < 0 || end < start) {
            throw new IllegalArgumentException("AI response did not contain a JSON object");
        }
        return stripped.substring(start, end + 1);
    }

    private record RecheckBatch(
            @JsonProperty("results") List<RecheckVerdict> results) {
    }

    private record RecheckVerdict(
            @JsonProperty("traceId") UUID traceId,
            @JsonProperty("judgment") InstructorJudgment judgment,
            @JsonProperty("reason") String reason) {
    }

    public record RoundMaterialization(
            UUID roundId,
            UUID previousRoundId,
            boolean recheckRequired) {
    }
}
