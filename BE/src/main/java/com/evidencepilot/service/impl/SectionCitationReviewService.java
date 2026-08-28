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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class SectionCitationReviewService {

    public static final String REVIEW_VERSION = "section-critique-v3";
    public static final String RULE_CATALOG_VERSION = "critique-rules-v2";
    private static final String SNAPSHOT_STYLE = REVIEW_VERSION;
    private static final int CHUNK_SIZE = 8_000;
    private static final int CHUNK_OVERLAP = 400;
    private static final int MAX_FINDINGS_PER_BATCH = 10;
    private static final int SOURCE_TOP_K = 20;
    private static final int SOURCE_LIMIT = 3;
    private static final int CANDIDATE_MIN_LENGTH = 30;
    private static final int CANDIDATE_MAX_LENGTH = 1_000;
    private static final int CANDIDATE_LIMIT = 10;
    private static final int RETRIEVAL_TOP_K = 5;
    private static final int EVIDENCE_CHUNK_LIMIT = 12;
    private static final int EVIDENCE_TEXT_LIMIT = 1_200;
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
                .flatMap(this::readSnapshot);
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
                .flatMap(this::readSnapshot);
        if (cached.isPresent()) {
            return cached.get();
        }

        String normalizedTitle = paperStandardService.normalizeSectionTitle(section.getSectionTitle());
        SectionCitationReviewResponse review = isPolicyExempt(normalizedTitle)
                ? notApplicable(
                        section, reviewInputFingerprint, exemptionSummary(normalizedTitle))
                : generate(section, reviewInputFingerprint, normalizedTitle, onProgress);
        saveSnapshot(project, reviewInputFingerprint, review);

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
                || findings.size() > MAX_FINDINGS_PER_BATCH) {
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
            BiConsumer<Integer, Integer> onProgress) {
        UUID projectId = section.getDocument().getProject().getId();
        List<Chunk> chunks = chunks(section.getContentTex());
        List<SectionCitationReviewResponse.Finding> findings = new ArrayList<>();
        List<String> limitations = new ArrayList<>();
        String provider = null;
        String model = null;
        RuntimeException lastFailure = null;
        int completedChunks = 0;
        onProgress.accept(0, chunks.size());

        for (int i = 0; i < chunks.size(); i++) {
            Chunk chunk = chunks.get(i);
            try {
                List<RetrievedEvidence> evidence = retrieveEvidence(projectId, chunk.content());
                Map<UUID, RetrievedEvidence> evidenceByChunkId = new LinkedHashMap<>();
                evidence.forEach(item -> evidenceByChunkId.put(item.chunkId(), item));
                GeneratedReview generated = generateChunkReview(
                        section, normalizedTitle, chunk, i, chunks.size(), evidence, evidenceByChunkId);
                if (provider == null) {
                    provider = generated.provider();
                    model = generated.model();
                }
                if (generated.discardedFindings() > 0) {
                    limitations.add("Chunk " + (i + 1) + "/" + chunks.size()
                            + " omitted " + generated.discardedFindings() + " invalid AI finding(s)");
                }
                for (ModelFinding finding : generated.review().findings()) {
                    int start = chunk.startOffset() + excerptStart(chunk.content(), finding.excerpt());
                    int end = start + finding.excerpt().length();
                    if (finding.type() == SectionCitationReviewResponse.FindingType.UNSUBSTANTIATED_CLAIM
                            && alreadyCited(section.getContentTex(), finding.excerpt(), end)) {
                        continue;
                    }
                    findings.add(new SectionCitationReviewResponse.Finding(
                            finding.type(),
                            finding.excerpt(),
                            start,
                            end,
                            finding.rationale().strip(),
                            finding.confidence(),
                            finding.evidence().stream()
                                    .map(item -> new SectionCitationReviewResponse.Evidence(
                                            item.sourceId(),
                                            item.chunkId(),
                                            item.quote() == null ? "" : item.quote().strip(),
                                            item.relation()))
                                    .toList()));
                }
                completedChunks++;
            } catch (RuntimeException exception) {
                lastFailure = exception;
                limitations.add("Chunk " + (i + 1) + "/" + chunks.size()
                        + " could not be reviewed: " + exception.getMessage());
            } finally {
                onProgress.accept(i + 1, chunks.size());
            }
        }
        if (completedChunks == 0 && lastFailure != null) {
            throw lastFailure;
        }

        Map<String, SectionCitationReviewResponse.Finding> unique = new LinkedHashMap<>();
        findings.stream()
                .sorted(Comparator.comparingInt(SectionCitationReviewResponse.Finding::startOffset))
                .forEach(finding -> unique.putIfAbsent(
                        finding.type() + ":" + finding.startOffset() + ":" + finding.endOffset(),
                        finding));
        List<SectionCitationReviewResponse.Finding> allFindings = List.copyOf(unique.values());
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
                completedChunks == chunks.size(),
                summarize(allFindings),
                allFindings,
                limitations);
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

    private GeneratedReview generateChunkReview(
            PaperSection section,
            String normalizedTitle,
            Chunk chunk,
            int chunkIndex,
            int chunkCount,
            List<RetrievedEvidence> evidence,
            Map<UUID, RetrievedEvidence> evidenceByChunkId) {
        String prompt = reviewPrompt(section, normalizedTitle, chunk, chunkIndex, chunkCount, evidence);
        RuntimeException lastFailure = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                AiModelClient.GenerationResult generation = aiModelClient.generateForReview(
                        SectionCitationReviewPrompt.SYSTEM,
                        attempt == 0 ? prompt : prompt + "\nPrevious output was invalid. Return valid JSON only.");
                ModelReview review = strictMapper().readValue(
                        extractJson(generation.response()), ModelReview.class);
                ValidatedReview validated = validateReview(
                        review, chunk, section.getId().toString(), chunkIndex, evidenceByChunkId);
                return new GeneratedReview(
                        generation.provider(), generation.model(),
                        validated.review(), validated.discardedFindings());
            } catch (JsonProcessingException | IllegalArgumentException exception) {
                lastFailure = new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "AI returned an invalid section citation review: " + exception.getMessage(),
                        exception);
            }
        }
        throw lastFailure;
    }

    private String reviewPrompt(
            PaperSection section,
            String normalizedTitle,
            Chunk chunk,
            int chunkIndex,
            int chunkCount,
            List<RetrievedEvidence> evidence) {
        Map<String, Object> context = new LinkedHashMap<>();
        Project project = section.getDocument().getProject();
        context.put("paperStandard", project.getTargetStandard() == null
                ? "CUSTOM" : project.getTargetStandard().name());
        context.put("sectionId", section.getId());
        context.put("sectionTitle", section.getSectionTitle());
        context.put("normalizedSectionTitle", normalizedTitle);
        context.put("sectionPolicy", sectionPolicy(normalizedTitle));
        context.put("chunkIndex", chunkIndex);
        context.put("chunkCount", chunkCount);
        context.put("contentTex", chunk.content());
        context.put("evidence", evidence.stream()
                .map(item -> Map.of(
                        "source_id", item.sourceId().toString(),
                        "chunk_id", item.chunkId().toString(),
                        "citation_key", item.citationKey(),
                        "title", item.title() == null ? "" : item.title(),
                        "text", item.text()))
                .toList());
        try {
            return objectMapper.writeValueAsString(context);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize section review context", exception);
        }
    }

    private ValidatedReview validateReview(
            ModelReview review,
            Chunk chunk,
            String sectionId,
            int chunkIndex,
            Map<UUID, RetrievedEvidence> evidenceByChunkId) {
        if (review == null
                || review.findings() == null
                || review.findings().size() > MAX_FINDINGS_PER_BATCH
                || !sectionId.equals(review.sectionId())
                || review.chunkIndex() != chunkIndex) {
            throw new IllegalArgumentException("Invalid review envelope");
        }
        List<ModelFinding> validFindings = new ArrayList<>();
        IllegalArgumentException firstFailure = null;
        for (ModelFinding finding : review.findings()) {
            try {
                validateFinding(finding, chunk, evidenceByChunkId);
                validFindings.add(finding);
            } catch (IllegalArgumentException exception) {
                if (firstFailure == null) {
                    firstFailure = exception;
                }
            }
        }
        if (!review.findings().isEmpty() && validFindings.isEmpty()) {
            throw firstFailure;
        }
        return new ValidatedReview(
                new ModelReview(review.sectionId(), review.chunkIndex(), List.copyOf(validFindings)),
                review.findings().size() - validFindings.size());
    }

    private void validateFinding(
            ModelFinding finding,
            Chunk chunk,
            Map<UUID, RetrievedEvidence> evidenceByChunkId) {
        if (finding == null
                || finding.type() == null
                || finding.confidence() == null
                || finding.excerpt() == null
                || finding.excerpt().isBlank()
                || finding.rationale() == null
                || finding.rationale().isBlank()
                || finding.rationale().length() > MAX_RATIONALE_LENGTH) {
            throw new IllegalArgumentException("Finding is not grounded in the supplied chunk");
        }
        excerptStart(chunk.content(), finding.excerpt());
        validateEvidence(finding, evidenceByChunkId);
    }

    private void validateEvidence(
            ModelFinding finding,
            Map<UUID, RetrievedEvidence> evidenceByChunkId) {
        if (finding.evidence() == null) {
            throw new IllegalArgumentException("Finding evidence array is required");
        }
        List<ModelEvidence> evidence = finding.evidence();
        if (evidence.size() > MAX_EVIDENCE_PER_FINDING) {
            throw new IllegalArgumentException("Finding cites too many evidence entries");
        }
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
            if (finding.type() == SectionCitationReviewResponse.FindingType.UNSUBSTANTIATED_CLAIM
                    && item.relation() == SectionCitationReviewResponse.EvidenceRelation.SUPPORTS) {
                throw new IllegalArgumentException(
                        "An unsubstantiated claim cannot carry supporting evidence");
            }
        }
        if (finding.type() == SectionCitationReviewResponse.FindingType.SOURCE_DISCREPANCY
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
        ReviewSnapshot snapshot = new ReviewSnapshot();
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

    private static List<Chunk> chunks(String content) {
        List<Chunk> chunks = new ArrayList<>();
        for (int start = 0; start < content.length();) {
            int end = Math.min(content.length(), start + CHUNK_SIZE);
            chunks.add(new Chunk(start, content.substring(start, end)));
            if (end == content.length()) {
                break;
            }
            start = end - CHUNK_OVERLAP;
        }
        return chunks;
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

    private record Chunk(int startOffset, String content) {
    }

    public record RetrievedEvidence(
            UUID sourceId, UUID chunkId, String citationKey, String title, String text) {
    }

    private record GeneratedReview(
            String provider,
            String model,
            ModelReview review,
            int discardedFindings) {
    }

    private record ValidatedReview(ModelReview review, int discardedFindings) {
    }

    private record ModelReview(
            @JsonProperty("section_id") String sectionId,
            @JsonProperty("chunk_index") int chunkIndex,
            List<ModelFinding> findings) {
    }

    private record ModelFinding(
            SectionCitationReviewResponse.FindingType type,
            String excerpt,
            String rationale,
            SectionCitationReviewResponse.Confidence confidence,
            List<ModelEvidence> evidence) {
    }

    private record ModelEvidence(
            @JsonProperty("source_id") UUID sourceId,
            @JsonProperty("chunk_id") UUID chunkId,
            String quote,
            SectionCitationReviewResponse.EvidenceRelation relation) {
    }
}
