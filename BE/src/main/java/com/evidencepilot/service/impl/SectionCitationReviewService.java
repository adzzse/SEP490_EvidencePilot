package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.SectionReviewSourceMatchRequest;
import com.evidencepilot.dto.response.SectionCitationReviewResponse;
import com.evidencepilot.dto.response.SectionReviewSourceMatchesResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ReviewSnapshot;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.prompt.SectionCitationReviewPrompt;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ReviewSnapshotRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.AuditService;
import com.evidencepilot.service.PaperStandardService;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.BreakIterator;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class SectionCitationReviewService {

    public static final String REVIEW_VERSION = "section-critique-v4";
    public static final String RULE_CATALOG_VERSION = "critique-rules-v2";
    private static final String SNAPSHOT_STYLE = REVIEW_VERSION;
    private static final int REVIEW_BATCH_SIZE = 10;
    private static final int SOURCE_TOP_K = 20;
    private static final int SOURCE_LIMIT = 3;
    private static final int CANDIDATE_MIN_LENGTH = 30;
    private static final int CANDIDATE_MAX_LENGTH = 1_000;
    private static final int CANDIDATE_LIMIT = 10;
    private static final int RETRIEVAL_TOP_K = 5;
    private static final int EVIDENCE_CHUNK_LIMIT = 12;
    private static final int EVIDENCE_TEXT_LIMIT = 1_200;
    private static final int REVIEW_EVIDENCE_TEXT_LIMIT = 600;
    private static final int MAX_RATIONALE_LENGTH = 1_000;
    private static final int MAX_EVIDENCE_PER_FINDING = 3;
    private static final Pattern SENTENCE_BOUNDARY = Pattern.compile("(?<=[.!?])\\s+");
    private static final Pattern LEADING_SOURCE_HEADINGS = Pattern.compile(
            "\\A(?:#{1,6}\\h+[^\\r\\n]*(?:\\R|\\z))+\\R*");
    private final AiModelClient aiModelClient;
    private final PaperSectionRepository paperSectionRepository;
    private final ReviewSnapshotRepository reviewSnapshotRepository;
    private final UserRepository userRepository;
    private final PaperStandardService paperStandardService;
    private final SourceMatchingService sourceMatchingService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public Optional<SectionCitationReviewResponse> cached(UUID documentId, UUID sectionId) {
        PaperSection section = requireSection(documentId, sectionId, false);
        String reviewInputFingerprint = reviewInputFingerprint(section);
        return reviewSnapshotRepository
                .findByProjectIdAndStyleAndInputFingerprint(
                        section.getDocument().getProject().getId(), SNAPSHOT_STYLE,
                        reviewInputFingerprint)
                .flatMap(this::readSnapshot)
                .filter(SectionCitationReviewResponse::complete);
    }

    @Transactional
    public SectionCitationReviewResponse run(
            UUID documentId,
            UUID projectId,
            UUID sectionId,
            String expectedReviewInputFingerprint,
            UUID requestedByUserId) {
        return run(
                documentId,
                projectId,
                sectionId,
                expectedReviewInputFingerprint,
                requestedByUserId,
                (current, total) -> {});
    }

    @Transactional
    public SectionCitationReviewResponse run(
            UUID documentId,
            UUID projectId,
            UUID sectionId,
            String expectedReviewInputFingerprint,
            UUID requestedByUserId,
            BiConsumer<Integer, Integer> onProgress) {
        return run(documentId, projectId, sectionId, expectedReviewInputFingerprint,
                requestedByUserId, onProgress, checkpoint -> {});
    }

    @Transactional
    public SectionCitationReviewResponse run(
            UUID documentId, UUID projectId, UUID sectionId, String expectedReviewInputFingerprint,
            UUID requestedByUserId, BiConsumer<Integer, Integer> onProgress,
            java.util.function.Consumer<SectionCitationReviewResponse> onCheckpoint) {
        PaperSection section = requireSection(documentId, sectionId, true);
        Project project = section.getDocument().getProject();
        if (!projectId.equals(project.getId())) {
            throw new IllegalArgumentException("Section review project does not match its job");
        }
        String reviewInputFingerprint = reviewInputFingerprint(section);
        if (!reviewInputFingerprint.equals(expectedReviewInputFingerprint)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "SECTION_REVIEW_INPUT_CHANGED: save the section and run Citation Review again");
        }
        Optional<SectionCitationReviewResponse> cached = reviewSnapshotRepository
                .findByProjectIdAndStyleAndInputFingerprint(
                        projectId, SNAPSHOT_STYLE, reviewInputFingerprint)
                .flatMap(this::readSnapshot)
                .filter(SectionCitationReviewResponse::complete);
        if (cached.isPresent()) {
            return cached.get();
        }

        String normalizedTitle = paperStandardService.normalizeSectionTitle(section.getSectionTitle());
        SectionCitationReviewResponse review = isPolicyExempt(normalizedTitle)
                ? notApplicable(
                        section, reviewInputFingerprint, exemptionSummary(normalizedTitle))
                : generate(section, reviewInputFingerprint, normalizedTitle, onProgress, onCheckpoint);
        if (review.complete()) {
            saveSnapshot(project, reviewInputFingerprint, review);
        }

        User actor = userRepository.findById(requestedByUserId)
                .orElseThrow(() -> new ResourceNotFoundException(requestedByUserId, "User"));
        auditService.record(
                "AI_SECTION_CITATION_REVIEW",
                "PaperSection",
                sectionId,
                actor,
                null,
                review);
        return review;
    }

    @Transactional(readOnly = true)
    public SectionReviewSourceMatchesResponse sourceMatches(
            UUID documentId,
            UUID sectionId,
            SectionReviewSourceMatchRequest request) {
        PaperSection section = requireSection(documentId, sectionId, true);
        List<SectionReviewSourceMatchRequest.Finding> findings = request.findings();
        if (findings == null || findings.isEmpty()
                || findings.size() > REVIEW_BATCH_SIZE) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Provide between 1 and 10 review findings per batch");
        }

        String content = section.getContentTex();
        Set<Integer> indexes = new LinkedHashSet<>();
        for (SectionReviewSourceMatchRequest.Finding finding : findings) {
            if (!indexes.add(finding.findingIndex())
                    || finding.startOffset() < 0
                    || finding.endOffset() <= finding.startOffset()
                    || finding.endOffset() > content.length()
                    || !content.substring(finding.startOffset(), finding.endOffset())
                            .equals(finding.excerpt())) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "A review finding no longer matches the saved section; run Citation Review again");
            }
        }

        List<List<SourceMatchingService.SourceMatch>> matches = sourceMatchingService.search(
                section.getDocument().getProject().getId(),
                findings.stream().map(SectionReviewSourceMatchRequest.Finding::excerpt).toList(),
                SOURCE_TOP_K);
        List<SectionReviewSourceMatchesResponse.FindingMatches> response = new ArrayList<>();
        for (int i = 0; i < findings.size(); i++) {
            Map<UUID, SectionReviewSourceMatchesResponse.SourceCandidate> unique = new LinkedHashMap<>();
            for (SourceMatchingService.SourceMatch match : matches.get(i)) {
                Document source = match.chunk().getDocument();
                unique.putIfAbsent(source.getId(), toCandidate(match));
                if (unique.size() == SOURCE_LIMIT) {
                    break;
                }
            }
            response.add(new SectionReviewSourceMatchesResponse.FindingMatches(
                    findings.get(i).findingIndex(), List.copyOf(unique.values())));
        }
        return new SectionReviewSourceMatchesResponse(response);
    }

    public String reviewInputFingerprint(PaperSection section) {
        Project project = section.getDocument().getProject();
        String standard = project.getTargetStandard() == null
                ? "CUSTOM" : project.getTargetStandard().name();
        String input = REVIEW_VERSION + '\0' + RULE_CATALOG_VERSION + '\0' + SectionCitationReviewPrompt.SYSTEM
                + '\0' + standard + '\0' + section.getId() + '\0' + section.getSectionTitle()
                + '\0' + sectionContentFingerprint(section) + '\0' + corpusRevision(project.getId());
        return sha256(input);
    }

    public String sectionContentFingerprint(PaperSection section) {
        return sectionContentFingerprint(section.getContentTex());
    }

    public String sectionContentFingerprint(String content) {
        return sha256(content == null ? "" : content);
    }

    private String sha256(String input) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String corpusRevision(UUID projectId) {
        return sourceMatchingService.retrievableSources(projectId).stream()
                .map(source -> String.join("\0",
                        source.getId().toString(),
                        source.getFileHashSha256() == null ? "" : source.getFileHashSha256(),
                        source.getProcessedAt() == null ? "" : source.getProcessedAt().toString(),
                        source.getChunkCount() == null ? "" : source.getChunkCount().toString()))
                .sorted()
                .collect(java.util.stream.Collectors.joining("\1"));
    }

    private SectionCitationReviewResponse generate(
            PaperSection section,
            String reviewInputFingerprint,
            String normalizedTitle,
            BiConsumer<Integer, Integer> onProgress,
            java.util.function.Consumer<SectionCitationReviewResponse> onCheckpoint) {
        UUID projectId = section.getDocument().getProject().getId();
        List<ClaimCandidate> candidates = sectionCandidates(section.getContentTex());
        int batchCount = (candidates.size() + REVIEW_BATCH_SIZE - 1) / REVIEW_BATCH_SIZE;
        List<SectionCitationReviewResponse.Finding> findings = new ArrayList<>();
        List<String> limitations = new ArrayList<>();
        String provider = null;
        String model = null;
        RuntimeException lastFailure = null;
        int completedBatches = 0;
        onProgress.accept(0, batchCount);

        for (int batchIndex = 0; batchIndex < batchCount; batchIndex++) {
            int fromIndex = batchIndex * REVIEW_BATCH_SIZE;
            List<ClaimCandidate> batch = List.copyOf(candidates.subList(
                    fromIndex, Math.min(candidates.size(), fromIndex + REVIEW_BATCH_SIZE)));
            try {
                List<CandidateContext> contexts = retrieveCandidateEvidence(projectId, batch);
                GeneratedReview generated = generateBatchReview(
                        section, normalizedTitle, contexts, batchIndex, batchCount);
                if (provider == null) {
                    provider = generated.provider();
                    model = generated.model();
                }
                Map<Integer, ClaimCandidate> candidateById = new LinkedHashMap<>();
                batch.forEach(candidate -> candidateById.put(candidate.id(), candidate));
                for (ModelVerdict verdict : generated.review().verdicts()) {
                    if (verdict.verdict() == Verdict.OK) {
                        continue;
                    }
                    ClaimCandidate candidate = candidateById.get(verdict.candidateId());
                    SectionCitationReviewResponse.FindingType findingType =
                            SectionCitationReviewResponse.FindingType.valueOf(verdict.verdict().name());
                    if (findingType == SectionCitationReviewResponse.FindingType.UNSUBSTANTIATED_CLAIM
                            && alreadyCited(section.getContentTex(), candidate.text(), candidate.endOffset())) {
                        continue;
                    }
                    findings.add(new SectionCitationReviewResponse.Finding(
                            findingType,
                            candidate.text(),
                            candidate.startOffset(),
                            candidate.endOffset(),
                            verdict.rationale().strip(),
                            verdict.confidence(),
                            verdict.evidence().stream()
                                    .map(item -> new SectionCitationReviewResponse.Evidence(
                                            item.sourceId(),
                                            item.chunkId(),
                                            item.quote() == null ? "" : item.quote().strip(),
                                            item.relation()))
                                    .toList()));
                }
                completedBatches++;
            } catch (RuntimeException exception) {
                lastFailure = exception;
                limitations.add("Batch " + (batchIndex + 1) + "/" + batchCount
                        + " could not be reviewed: " + exception.getMessage());
            } finally {
                onProgress.accept(batchIndex + 1, batchCount);
            }
            if (completedBatches > 0) {
                List<String> checkpointLimitations = new ArrayList<>(limitations);
                for (int pending = batchIndex + 1; pending < batchCount; pending++) {
                    checkpointLimitations.add("Batch " + (pending + 1) + "/" + batchCount + " has not been reviewed yet");
                }
                onCheckpoint.accept(reviewResult(section, reviewInputFingerprint, provider, model,
                        false, findings, checkpointLimitations));
            }
        }
        if (completedBatches == 0 && lastFailure != null) {
            throw lastFailure;
        }

        return reviewResult(section, reviewInputFingerprint, provider, model,
                completedBatches == batchCount, findings, limitations);
    }

    private SectionCitationReviewResponse reviewResult(PaperSection section, String reviewInputFingerprint,
            String provider, String model, boolean complete,
            List<SectionCitationReviewResponse.Finding> findings, List<String> limitations) {
        List<SectionCitationReviewResponse.Finding> allFindings = findings.stream()
                .sorted(Comparator.comparingInt(SectionCitationReviewResponse.Finding::startOffset))
                .toList();
        return new SectionCitationReviewResponse(
                REVIEW_VERSION,
                RULE_CATALOG_VERSION,
                section.getId(),
                section.getVersion(),
                reviewInputFingerprint,
                sectionContentFingerprint(section),
                LocalDateTime.now(),
                provider,
                model,
                complete,
                summarize(allFindings),
                allFindings,
                List.copyOf(limitations));
    }

    private String summarize(List<SectionCitationReviewResponse.Finding> findings) {
        if (findings.isEmpty()) {
            return "No unsubstantiated claims or source discrepancies were found.";
        }
        long unsubstantiated = findings.stream()
                .filter(finding -> finding.type()
                        == SectionCitationReviewResponse.FindingType.UNSUBSTANTIATED_CLAIM)
                .count();
        long discrepancies = findings.size() - unsubstantiated;
        return findings.size() + " finding(s): " + unsubstantiated
                + " unsubstantiated claim(s), " + discrepancies + " source discrepanc(ies).";
    }

    public List<RetrievedEvidence> retrieveEvidence(UUID projectId, String chunkContent) {
        List<String> candidates = candidateClaims(chunkContent);
        if (candidates.isEmpty()) {
            return List.of();
        }
        List<List<SourceMatchingService.SourceMatch>> matches =
                sourceMatchingService.search(projectId, candidates, RETRIEVAL_TOP_K);
        Map<UUID, RetrievedEvidence> unique = new LinkedHashMap<>();
        for (int rank = 0; rank < RETRIEVAL_TOP_K && unique.size() < EVIDENCE_CHUNK_LIMIT; rank++) {
            for (List<SourceMatchingService.SourceMatch> candidateMatches : matches) {
                if (rank >= candidateMatches.size() || unique.size() == EVIDENCE_CHUNK_LIMIT) {
                    continue;
                }
                DocumentChunk chunk = candidateMatches.get(rank).chunk();
                Document source = chunk.getDocument();
                String text = chunk.getText() == null ? "" : chunk.getText();
                if (text.length() > EVIDENCE_TEXT_LIMIT) {
                    text = text.substring(0, EVIDENCE_TEXT_LIMIT);
                }
                unique.putIfAbsent(chunk.getId(), new RetrievedEvidence(
                        source.getId(),
                        chunk.getId(),
                        SourceMatchingService.citationKey(source.getId()),
                        source.getTitle() == null || source.getTitle().isBlank()
                                ? source.getOriginalFilename() : source.getTitle(),
                        text));
            }
        }
        return List.copyOf(unique.values());
    }

    private List<CandidateContext> retrieveCandidateEvidence(
            UUID projectId, List<ClaimCandidate> candidates) {
        List<List<SourceMatchingService.SourceMatch>> matches = sourceMatchingService.search(
                projectId, candidates.stream().map(ClaimCandidate::text).toList(), RETRIEVAL_TOP_K);
        if (matches.isEmpty()) {
            return candidates.stream()
                    .map(candidate -> new CandidateContext(candidate, List.of()))
                    .toList();
        }
        if (matches.size() != candidates.size()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI service returned an invalid evidence batch");
        }
        List<CandidateContext> contexts = new ArrayList<>();
        for (int index = 0; index < candidates.size(); index++) {
            Map<UUID, RetrievedEvidence> unique = new LinkedHashMap<>();
            for (SourceMatchingService.SourceMatch match : matches.get(index)) {
                DocumentChunk chunk = match.chunk();
                Document source = chunk.getDocument();
                String text = chunk.getText() == null ? "" : chunk.getText();
                if (text.length() > REVIEW_EVIDENCE_TEXT_LIMIT) {
                    text = text.substring(0, REVIEW_EVIDENCE_TEXT_LIMIT);
                }
                unique.putIfAbsent(chunk.getId(), new RetrievedEvidence(
                        source.getId(),
                        chunk.getId(),
                        SourceMatchingService.citationKey(source.getId()),
                        source.getTitle() == null || source.getTitle().isBlank()
                                ? source.getOriginalFilename() : source.getTitle(),
                        text));
            }
            contexts.add(new CandidateContext(candidates.get(index), List.copyOf(unique.values())));
        }
        return List.copyOf(contexts);
    }

    private static List<String> candidateClaims(String chunkContent) {
        List<String> candidates = new ArrayList<>();
        for (String sentence : SENTENCE_BOUNDARY.split(chunkContent)) {
            String candidate = sentence.strip();
            if (candidate.length() >= CANDIDATE_MIN_LENGTH
                    && candidate.length() <= CANDIDATE_MAX_LENGTH) {
                candidates.add(candidate);
            }
            if (candidates.size() == CANDIDATE_LIMIT) {
                break;
            }
        }
        return candidates;
    }

    private static List<ClaimCandidate> sectionCandidates(String content) {
        List<ClaimCandidate> candidates = new ArrayList<>();
        BreakIterator boundary = BreakIterator.getSentenceInstance(Locale.ENGLISH);
        boundary.setText(content);
        int start = boundary.first();
        for (int end = boundary.next(); end != BreakIterator.DONE; start = end, end = boundary.next()) {
            addCandidate(candidates, content, start, end);
        }
        return List.copyOf(candidates);
    }

    private static void addCandidate(
            List<ClaimCandidate> candidates, String content, int start, int end) {
        while (start < end && Character.isWhitespace(content.charAt(start))) {
            start++;
        }
        while (end > start && Character.isWhitespace(content.charAt(end - 1))) {
            end--;
        }
        if (end > start && ".!?".indexOf(content.charAt(end - 1)) >= 0) {
            end--;
        }
        if (end > start) {
            candidates.add(new ClaimCandidate(
                    candidates.size(), content.substring(start, end), start, end));
        }
    }

    private GeneratedReview generateBatchReview(
            PaperSection section,
            String normalizedTitle,
            List<CandidateContext> contexts,
            int batchIndex,
            int batchCount) {
        String prompt = reviewPrompt(section, normalizedTitle, contexts, batchIndex, batchCount);
        return aiModelClient.generateValidated(SectionCitationReviewPrompt.SYSTEM, prompt, null, generation -> {
            try {
                ModelReview review = strictMapper().readValue(
                        extractJson(generation.response()), ModelReview.class);
                validateReview(review, contexts, section.getId().toString(), batchIndex);
                return new GeneratedReview(generation.provider(), generation.model(), review);
            } catch (JsonProcessingException exception) {
                throw new IllegalArgumentException("Invalid section citation review JSON", exception);
            }
        });
    }

    private String reviewPrompt(
            PaperSection section,
            String normalizedTitle,
            List<CandidateContext> contexts,
            int batchIndex,
            int batchCount) {
        Map<String, Object> context = new LinkedHashMap<>();
        Project project = section.getDocument().getProject();
        context.put("paperStandard", project.getTargetStandard() == null
                ? "CUSTOM" : project.getTargetStandard().name());
        context.put("sectionId", section.getId());
        context.put("sectionTitle", section.getSectionTitle());
        context.put("normalizedSectionTitle", normalizedTitle);
        context.put("sectionPolicy", sectionPolicy(normalizedTitle));
        context.put("batchIndex", batchIndex);
        context.put("batchCount", batchCount);
        context.put("candidates", contexts.stream()
                .map(item -> Map.of(
                        "candidate_id", item.candidate().id(),
                        "text", item.candidate().text(),
                        "evidence", item.evidence().stream()
                                .map(evidence -> Map.of(
                                        "source_id", evidence.sourceId().toString(),
                                        "chunk_id", evidence.chunkId().toString(),
                                        "citation_key", evidence.citationKey(),
                                        "title", evidence.title() == null ? "" : evidence.title(),
                                        "text", evidence.text()))
                                .toList()))
                .toList());
        try {
            return objectMapper.writeValueAsString(context);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize section review context", exception);
        }
    }

    private void validateReview(
            ModelReview review,
            List<CandidateContext> contexts,
            String sectionId,
            int batchIndex) {
        if (review == null
                || review.verdicts() == null
                || review.verdicts().size() != contexts.size()
                || !sectionId.equals(review.sectionId())
                || review.batchIndex() == null
                || review.batchIndex() != batchIndex) {
            throw new IllegalArgumentException("Invalid review envelope");
        }
        Map<Integer, CandidateContext> contextById = new LinkedHashMap<>();
        contexts.forEach(context -> contextById.put(context.candidate().id(), context));
        Set<Integer> seen = new LinkedHashSet<>();
        for (ModelVerdict verdict : review.verdicts()) {
            CandidateContext context = verdict == null || verdict.candidateId() == null
                    ? null : contextById.get(verdict.candidateId());
            if (context == null || !seen.add(verdict.candidateId())) {
                throw new IllegalArgumentException("AI must return one verdict for every candidate");
            }
            validateVerdict(verdict, context);
        }
        if (seen.size() != contexts.size()) {
            throw new IllegalArgumentException("AI must return one verdict for every candidate");
        }
    }

    private void validateVerdict(ModelVerdict verdict, CandidateContext context) {
        if (verdict.verdict() == null || verdict.evidence() == null) {
            throw new IllegalArgumentException("Candidate verdict is incomplete");
        }
        if (verdict.verdict() == Verdict.OK) {
            if (!verdict.evidence().isEmpty()) {
                throw new IllegalArgumentException("OK verdict cannot carry evidence");
            }
            return;
        }
        if (verdict.confidence() == null
                || verdict.rationale() == null
                || verdict.rationale().isBlank()
                || verdict.rationale().length() > MAX_RATIONALE_LENGTH) {
            throw new IllegalArgumentException("Finding verdict is incomplete");
        }
        validateEvidence(verdict, context.evidence());
    }

    private void validateEvidence(
            ModelVerdict verdict,
            List<RetrievedEvidence> candidateEvidence) {
        List<ModelEvidence> evidence = verdict.evidence();
        if (evidence.size() > MAX_EVIDENCE_PER_FINDING) {
            throw new IllegalArgumentException("Finding cites too many evidence entries");
        }
        Map<UUID, RetrievedEvidence> evidenceByChunkId = new LinkedHashMap<>();
        candidateEvidence.forEach(item -> evidenceByChunkId.put(item.chunkId(), item));
        boolean contradicts = false;
        for (ModelEvidence item : evidence) {
            if (item == null || item.relation() == null || item.chunkId() == null || item.sourceId() == null) {
                throw new IllegalArgumentException("Evidence entry is incomplete");
            }
            RetrievedEvidence retrieved = evidenceByChunkId.get(item.chunkId());
            if (retrieved == null || !retrieved.sourceId().equals(item.sourceId())) {
                throw new IllegalArgumentException("Evidence cites a chunk that was not retrieved");
            }
            if (item.relation() != SectionCitationReviewResponse.EvidenceRelation.NOT_FOUND) {
                if (item.quote() == null
                        || item.quote().isBlank()
                        || !retrieved.text().contains(item.quote().strip())) {
                    throw new IllegalArgumentException("Evidence quote is not verbatim from its chunk");
                }
            }
            if (item.relation() == SectionCitationReviewResponse.EvidenceRelation.CONTRADICTS) {
                contradicts = true;
            }
            if (verdict.verdict() == Verdict.UNSUBSTANTIATED_CLAIM
                    && item.relation() == SectionCitationReviewResponse.EvidenceRelation.SUPPORTS) {
                throw new IllegalArgumentException(
                        "An unsubstantiated claim cannot carry supporting evidence");
            }
        }
        if (verdict.verdict() == Verdict.SOURCE_DISCREPANCY
                && !contradicts) {
            throw new IllegalArgumentException(
                    "A source discrepancy requires at least one contradicting quote");
        }
    }

    private String sectionPolicy(String title) {
        return switch (title) {
            case "Methodology" -> "Cross-examine named or adapted methods, datasets, instruments, and standards against the retrieved evidence.";
            case "Results" -> "Do not flag this study's own results; cross-examine only external baselines, comparisons, and facts.";
            case "Discussion" -> "Cross-examine prior-work comparisons, external facts, statistics, and causal generalizations.";
            case "Conclusion" -> "Cross-examine only new external facts, prior work, statistics, or generalizations, not summaries of this study.";
            default -> "Cross-examine external facts, statistics, prior work, and attributed methods against the retrieved evidence.";
        };
    }

    private PaperSection requireSection(UUID documentId, UUID sectionId, boolean requireContent) {
        PaperSection section = paperSectionRepository.findByIdWithDocument(sectionId)
                .filter(PaperSection::isActive)
                .filter(found -> documentId.equals(found.getDocument().getId()))
                .filter(found -> found.getDocument().isActive())
                .filter(found -> found.getDocument().getDocType() == DocumentType.PAPER)
                .filter(found -> found.getDocument().getProject() != null)
                .orElseThrow(() -> new ResourceNotFoundException(sectionId, "PaperSection"));
        if (requireContent && (section.getContentTex() == null || section.getContentTex().isBlank())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Citation Review requires a non-empty saved section");
        }
        return section;
    }

    private Optional<SectionCitationReviewResponse> readSnapshot(ReviewSnapshot snapshot) {
        try {
            return Optional.of(objectMapper.readValue(
                    snapshot.getResponseJson(), SectionCitationReviewResponse.class));
        } catch (JsonProcessingException exception) {
            return Optional.empty();
        }
    }

    private void saveSnapshot(
            Project project,
            String fingerprint,
            SectionCitationReviewResponse review) {
        ReviewSnapshot snapshot = reviewSnapshotRepository
                .findByProjectIdAndStyleAndInputFingerprint(
                        project.getId(), SNAPSHOT_STYLE, fingerprint)
                .orElseGet(ReviewSnapshot::new);
        snapshot.setProject(project);
        snapshot.setStyle(SNAPSHOT_STYLE);
        snapshot.setInputFingerprint(fingerprint);
        snapshot.setCreatedAt(LocalDateTime.now());
        try {
            snapshot.setResponseJson(objectMapper.writeValueAsString(review));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize section review", exception);
        }
        reviewSnapshotRepository.save(snapshot);
    }

    private SectionCitationReviewResponse notApplicable(
            PaperSection section, String reviewInputFingerprint, String summary) {
        return new SectionCitationReviewResponse(
                REVIEW_VERSION,
                RULE_CATALOG_VERSION,
                section.getId(),
                section.getVersion(),
                reviewInputFingerprint,
                sectionContentFingerprint(section),
                LocalDateTime.now(),
                null,
                null,
                true,
                summary,
                List.of(),
                List.of());
    }

    private static String exemptionSummary(String title) {
        return "Abstract".equals(title)
                ? "The abstract is exempt from citation critique."
                : "Citation critique is not applicable to the references section.";
    }

    private SectionReviewSourceMatchesResponse.SourceCandidate toCandidate(
            SourceMatchingService.SourceMatch match) {
        Document source = match.chunk().getDocument();
        String filename = source.getOriginalFilename() == null || source.getOriginalFilename().isBlank()
                ? source.getId().toString() : source.getOriginalFilename();
        String title = source.getTitle() == null || source.getTitle().isBlank()
                ? filename : source.getTitle();
        return new SectionReviewSourceMatchesResponse.SourceCandidate(
                match.chunk().getId(),
                source.getId(),
                SourceMatchingService.citationKey(source.getId()),
                filename,
                title,
                source.getAuthors(),
                source.getPublicationYear(),
                source.getDoi(),
                sourceExcerpt(match.chunk().getText()),
                match.similarityScore());
    }

    private static String sourceExcerpt(String text) {
        if (text == null) {
            return "";
        }
        return LEADING_SOURCE_HEADINGS.matcher(text.stripLeading()).replaceFirst("").strip();
    }

    private static boolean alreadyCited(String content, String excerpt, int endOffset) {
        if (excerpt.contains("\\cite")) {
            return true;
        }
        String suffix = content.substring(endOffset, Math.min(content.length(), endOffset + 80));
        return suffix.stripLeading().startsWith("\\cite");
    }

    private static int excerptStart(String content, String excerpt) {
        int start = content.indexOf(excerpt);
        if (start < 0 || content.indexOf(excerpt, start + 1) >= 0) {
            throw new IllegalArgumentException(
                    "Finding excerpt is missing or ambiguous in the supplied chunk");
        }
        return start;
    }

    private ObjectMapper strictMapper() {
        return objectMapper.copy()
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES);
    }

    private static String extractJson(String response) {
        if (response == null) {
            throw new IllegalArgumentException("Empty AI response");
        }
        int start = response.indexOf('{');
        int end = response.lastIndexOf('}');
        if (start < 0 || end < start) {
            throw new IllegalArgumentException("AI response did not contain JSON");
        }
        return response.substring(start, end + 1);
    }

    private static boolean isPolicyExempt(String title) {
        return "Abstract".equals(title) || "References".equals(title) || "Works Cited".equals(title);
    }

    private record ClaimCandidate(int id, String text, int startOffset, int endOffset) {
    }

    private record CandidateContext(ClaimCandidate candidate, List<RetrievedEvidence> evidence) {
    }

    public record RetrievedEvidence(
            UUID sourceId, UUID chunkId, String citationKey, String title, String text) {
    }

    private record GeneratedReview(
            String provider,
            String model,
            ModelReview review) {
    }

    private record ModelReview(
            @JsonProperty("section_id") String sectionId,
            @JsonProperty("batch_index") Integer batchIndex,
            List<ModelVerdict> verdicts) {
    }

    private record ModelVerdict(
            @JsonProperty("candidate_id") Integer candidateId,
            Verdict verdict,
            String rationale,
            SectionCitationReviewResponse.Confidence confidence,
            List<ModelEvidence> evidence) {
    }

    private enum Verdict {
        OK,
        UNSUBSTANTIATED_CLAIM,
        SOURCE_DISCREPANCY
    }

    private record ModelEvidence(
            @JsonProperty("source_id") UUID sourceId,
            @JsonProperty("chunk_id") UUID chunkId,
            String quote,
            SectionCitationReviewResponse.EvidenceRelation relation) {
    }
}
