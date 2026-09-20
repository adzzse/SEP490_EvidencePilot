package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.PaperReferenceCheckResponse;
import com.evidencepilot.dto.response.PaperReferenceResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperReference;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperSectionType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.PaperReferenceRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.CitationBibliography;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.OptionalInt;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PaperReferenceService {

    private static final Pattern DOI_PATTERN = Pattern.compile(
            "(?i)10\\.\\d{4,9}/[-._;()/:A-Z0-9]+");
    private static final Pattern EP_KEY_PATTERN = Pattern.compile(
            "(?i)\\bep[0-9a-f]{32}\\b");
    private static final Pattern YEAR_PATTERN = Pattern.compile(
            "(?<!\\d)(19\\d{2}|20\\d{2})(?!\\d)");
    private static final Pattern BIBITEM_PATTERN = Pattern.compile(
            "(?s)\\\\bibitem(?:\\[[^]]*])?\\{([^}]+)}(.*?)(?=\\\\bibitem|\\z)");
    private static final Pattern NUMBERED_ENTRY_PATTERN = Pattern.compile(
            "(?m)(?=^[ \\t]*(?:-[ \\t]*)?(?:\\[\\d+]|\\d+[.)])[ \\t]+)");
    private static final Pattern REFERENCE_NUMBER_PATTERN = Pattern.compile(
            "^[ \\t]*(?:-[ \\t]*)?(?:\\[(\\d+)]|(\\d+)[.)])[ \\t]+");
    private record ParsedEntry(
            String rawText, String citationKey, String doi, Integer year, Integer number) {
    }

    private record Match(Document source, PaperReferenceCheckResponse.MatchReason reason, boolean ambiguous) {
    }

    private final DocumentRepository documentRepository;
    private final PaperReferenceRepository paperReferenceRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final ProjectDocumentRepository projectDocumentRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final SourceMatchingService sourceMatchingService;
    private final UserRepository userRepository;
    private final CurrentUserServiceImpl currentUserService;
    private final PaperProcessingServiceImpl paperProcessingService;

    @Transactional(readOnly = true)
    public PaperReferenceCheckResponse check(UUID paperId, UUID requesterId) {
        User requester = requireUser(requesterId);
        Document paper = requirePaper(paperId);
        currentUserService.requireProjectAccess(requester, paper.getProject());

        List<PaperSection> referenceSections = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(paperId).stream()
                .filter(PaperSection::isActive)
                .filter(PaperReferenceService::isReferenceSection)
                .toList();
        if (referenceSections.isEmpty()) {
            return emptyCheck(false);
        }

        List<ParsedEntry> entries = parseEntries(referenceSections);
        if (entries.isEmpty()) {
            return emptyCheck(true);
        }

        List<Document> visibleSources = sourceMatchingService.activeSources(paper.getProject().getId());
        Set<UUID> declaredIds = sourceMatchingService.referenceSources(paperId).stream()
                .map(Document::getId)
                .collect(Collectors.toSet());
        List<PaperReferenceCheckResponse.Item> items = new ArrayList<>();
        for (int index = 0; index < entries.size(); index++) {
            ParsedEntry entry = entries.get(index);
            items.add(toCheckItem(index + 1, entry, match(entry, visibleSources), declaredIds));
        }
        return response(true, items);
    }

    private static boolean isReferenceSection(PaperSection section) {
        return section != null && section.getSectionType() == PaperSectionType.REFERENCE;
    }

    private static List<ParsedEntry> parseEntries(List<PaperSection> sections) {
        List<ParsedEntry> entries = new ArrayList<>();
        for (PaperSection section : sections) {
            String content = section.getContentTex();
            if (content == null || content.isBlank()) {
                continue;
            }
            Matcher bibitems = BIBITEM_PATTERN.matcher(content);
            boolean hasBibitems = false;
            int previousEnd = 0;
            while (bibitems.find()) {
                hasBibitems = true;
                addEntries(entries, content.substring(previousEnd, bibitems.start()), null);
                addEntry(entries, bibitems.group(2), bibitems.group(1));
                previousEnd = bibitems.end();
            }
            if (!hasBibitems) {
                addEntries(entries, content, null);
            }
        }
        return entries;
    }

    private static void addEntries(List<ParsedEntry> entries, String content, String citationKey) {
        String cleanedContent = cleanEntry(content);
        String[] blocks = cleanedContent.split("(?:\\R\\s*){2,}");
        boolean keyed = false;
        for (String block : blocks) {
            for (String numberedBlock : block.split(NUMBERED_ENTRY_PATTERN.pattern())) {
                if (addEntry(entries, numberedBlock, keyed ? null : citationKey)) keyed = true;
            }
        }
    }

    private static boolean addEntry(List<ParsedEntry> entries, String content, String citationKey) {
        String rawText = cleanEntry(content);
        if (rawText.isBlank()) return false;
        entries.add(parsedEntry(rawText, citationKey));
        return true;
    }

    private static ParsedEntry parsedEntry(String rawText, String citationKey) {
        Matcher keyMatcher = EP_KEY_PATTERN.matcher(rawText);
        Matcher doiMatcher = DOI_PATTERN.matcher(rawText);
        return new ParsedEntry(rawText,
                citationKey == null && keyMatcher.find() ? keyMatcher.group() : citationKey,
                doiMatcher.find() ? normalizeDoi(doiMatcher.group()) : null,
                extractYear(rawText), extractReferenceNumber(rawText));
    }

    private static Integer extractReferenceNumber(String value) {
        Matcher matcher = REFERENCE_NUMBER_PATTERN.matcher(value == null ? "" : value);
        if (!matcher.find()) return null;
        return Integer.valueOf(matcher.group(1) != null ? matcher.group(1) : matcher.group(2));
    }

    private static String cleanEntry(String rawText) {
        if (rawText == null) {
            return "";
        }
        return rawText
                .replaceAll("(?s)\\\\begin\\{thebibliography}\\{[^}]*}", "")
                .replaceAll("(?s)\\\\end\\{thebibliography}", "")
                .replaceAll("(?m)^\\s*\\\\bibliography\\{[^}]*}\\s*$", "")
                .trim();
    }

    private static String normalizeDoi(String value) {
        if (value == null) {
            return null;
        }
        return value.trim().toLowerCase(Locale.ROOT)
                .replaceFirst("^(?:https://doi\\.org/|http://dx\\.doi\\.org/)", "")
                .replaceFirst("[.,;:\\)\\]\\}]+$", "");
    }

    private static String normalizeText(String value) {
        if (value == null) {
            return "";
        }
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKD)
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}]+", " ")
                .trim();
        return normalized.replaceAll("\\s+", " ");
    }

    private static Integer extractYear(String value) {
        Matcher matcher = YEAR_PATTERN.matcher(value == null ? "" : value);
        return matcher.find() ? Integer.valueOf(matcher.group()) : null;
    }

    private static Match match(ParsedEntry entry, List<Document> visibleSources) {
        UUID citationSourceId = SourceMatchingService.citationDocumentId(entry.citationKey()).orElse(null);
        if (citationSourceId != null) {
            Document citationSource = visibleSources.stream()
                    .filter(source -> citationSourceId.equals(source.getId()))
                    .findFirst()
                    .orElse(null);
            if (citationSource != null) {
                return new Match(citationSource, PaperReferenceCheckResponse.MatchReason.CITATION_KEY, false);
            }
        }

        if (entry.doi() != null) {
            List<Document> doiMatches = visibleSources.stream()
                    .filter(source -> entry.doi().equals(normalizeDoi(source.getDoi())))
                    .toList();
            if (doiMatches.size() == 1) {
                return new Match(doiMatches.getFirst(), PaperReferenceCheckResponse.MatchReason.DOI, false);
            }
            if (doiMatches.size() > 1) {
                return new Match(null, PaperReferenceCheckResponse.MatchReason.AMBIGUOUS, true);
            }
        }

        String normalizedEntry = normalizeText(entry.rawText());
        List<Document> titleMatches = visibleSources.stream()
                .filter(source -> {
                    String title = normalizeText(source.getTitle());
                    return title.length() >= 16
                            && normalizedEntry.contains(title)
                            && (entry.year() == null || source.getPublicationYear() == null
                            || entry.year().equals(source.getPublicationYear()));
                })
                .toList();
        if (titleMatches.size() == 1) {
            return new Match(titleMatches.getFirst(), PaperReferenceCheckResponse.MatchReason.TITLE_YEAR, false);
        }
        if (titleMatches.size() > 1) {
            return new Match(null, PaperReferenceCheckResponse.MatchReason.AMBIGUOUS, true);
        }
        return new Match(null, PaperReferenceCheckResponse.MatchReason.NONE, false);
    }

    private static PaperReferenceCheckResponse.Status sourceStatus(Document source) {
        if (source.getProcessingStatus() == ProcessingStatus.READY
                || source.getProcessingStatus() == ProcessingStatus.COMPLETED) {
            return PaperReferenceCheckResponse.Status.READY;
        }
        String fileUrl = source.getFileUrl();
        if (fileUrl == null || fileUrl.isBlank() || "pending".equalsIgnoreCase(fileUrl.trim())) {
            return PaperReferenceCheckResponse.Status.MISSING_FILE;
        }
        if (source.getProcessingStatus() == ProcessingStatus.FAILED
                || source.getProcessingStatus() == ProcessingStatus.PARTIAL) {
            return PaperReferenceCheckResponse.Status.UNAVAILABLE;
        }
        return PaperReferenceCheckResponse.Status.PROCESSING;
    }

    private static PaperReferenceCheckResponse.Item toCheckItem(
            int index, ParsedEntry entry, Match match, Set<UUID> declaredIds) {
        if (match.source() == null) {
            PaperReferenceCheckResponse.Status status = match.ambiguous()
                    || normalizeText(entry.rawText()).length() < 16
                    ? PaperReferenceCheckResponse.Status.NEEDS_REVIEW
                    : PaperReferenceCheckResponse.Status.MISSING_SOURCE;
            return new PaperReferenceCheckResponse.Item(index, entry.rawText(), entry.doi(), entry.year(),
                    status, match.reason(), null, null, false);
        }
        Document source = match.source();
        return new PaperReferenceCheckResponse.Item(index, entry.rawText(), entry.doi(), entry.year(),
                sourceStatus(source), match.reason(), source.getId(), source.getTitle(),
                declaredIds.contains(source.getId()));
    }

    private PaperReferenceCheckResponse emptyCheck(boolean referenceSectionFound) {
        return response(referenceSectionFound, List.of());
    }

    private PaperReferenceCheckResponse response(
            boolean referenceSectionFound, List<PaperReferenceCheckResponse.Item> items) {
        PaperReferenceCheckResponse.Summary summary = new PaperReferenceCheckResponse.Summary(
                items.size(),
                count(items, PaperReferenceCheckResponse.Status.READY),
                count(items, PaperReferenceCheckResponse.Status.MISSING_FILE),
                count(items, PaperReferenceCheckResponse.Status.PROCESSING),
                count(items, PaperReferenceCheckResponse.Status.UNAVAILABLE),
                count(items, PaperReferenceCheckResponse.Status.MISSING_SOURCE),
                count(items, PaperReferenceCheckResponse.Status.NEEDS_REVIEW),
                (int) items.stream()
                        .filter(item -> item.matchedSourceId() != null && !item.declaredReference())
                        .count());
        return new PaperReferenceCheckResponse(referenceSectionFound, summary, items);
    }

    private static int count(
            List<PaperReferenceCheckResponse.Item> items, PaperReferenceCheckResponse.Status status) {
        return (int) items.stream().filter(item -> item.status() == status).count();
    }

    @Transactional(readOnly = true)
    public List<PaperReferenceResponse> list(UUID paperId, UUID requesterId) {
        User requester = requireUser(requesterId);
        Document paper = requirePaper(paperId);
        currentUserService.requireProjectAccess(requester, paper.getProject());
        List<Document> visibleSources = sourceMatchingService.activeSources(paper.getProject().getId());
        Map<UUID, Integer> citationNumbers = referenceNumbers(paperId, visibleSources);
        return paperReferenceRepository.findByPaperIdOrderByAddedAtAsc(paperId).stream()
                .filter(reference -> reference.getSource() != null
                        && reference.getSource().isActive()
                        && reference.getSource().getDocType() == DocumentType.SOURCE)
                .map(reference -> response(reference, requester, paper.getProject(),
                        citationNumbers.get(reference.getSource().getId())))
                .toList();
    }

    @Transactional
    public PaperReferenceResponse add(UUID paperId, UUID sourceId, UUID requesterId) {
        // Lock before the first consistent read: duplicate adds see the committed link.
        Document paper = documentRepository.findByIdForUpdate(paperId)
                .orElseThrow(() -> new ResourceNotFoundException(paperId, "Paper"));
        validatePaper(paper);
        User requester = requireUser(requesterId);
        requireStudentWriter(requester, paper.getProject());
        Document source = requireVisibleSource(paper.getProject(), sourceId);
        List<PaperSection> sections = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(paperId).stream()
                .filter(PaperSection::isActive)
                .filter(PaperReferenceService::isReferenceSection)
                .toList();
        List<Document> visibleSources = sourceMatchingService.activeSources(paper.getProject().getId());
        Map<UUID, Integer> citationNumbers = referenceNumbers(sections, visibleSources);
        return paperReferenceRepository.findByPaperIdAndSourceId(paperId, sourceId)
                .map(reference -> response(reference, requester, paper.getProject(),
                        citationNumbers.get(sourceId)))
                .orElseGet(() -> {
                    Integer citationNumber = citationNumbers.get(sourceId);
                    if (citationNumber == null && !sections.isEmpty()) {
                        PaperSection referenceSection = sections.getFirst();
                        citationNumber = nextReferenceNumber(referenceSection.getContentTex());
                        String content = appendReference(
                                referenceSection.getContentTex(), citationNumber, source);
                        paperProcessingService.updateSection(
                                paperId, referenceSection.getId(), null, null, null,
                                content, referenceSection.getOptVersion());
                    }
                    PaperReference reference = new PaperReference();
                    reference.setPaper(paper);
                    reference.setSource(source);
                    reference.setAddedBy(requester);
                    reference.setAddedAt(LocalDateTime.now());
                    return response(paperReferenceRepository.save(reference), requester,
                            paper.getProject(), citationNumber);
                });
    }

    private Map<UUID, Integer> referenceNumbers(UUID paperId, List<Document> visibleSources) {
        List<PaperSection> sections = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(paperId).stream()
                .filter(PaperSection::isActive)
                .filter(PaperReferenceService::isReferenceSection)
                .toList();
        return referenceNumbers(sections, visibleSources);
    }

    private static Map<UUID, Integer> referenceNumbers(
            List<PaperSection> sections, List<Document> visibleSources) {
        Map<UUID, Integer> numbers = new LinkedHashMap<>();
        List<ParsedEntry> entries = parseEntries(sections);
        for (int index = 0; index < entries.size(); index++) {
            ParsedEntry entry = entries.get(index);
            Match matched = match(entry, visibleSources);
            if (matched.source() != null) {
                numbers.putIfAbsent(matched.source().getId(),
                        entry.number() != null ? entry.number() : index + 1);
            }
        }
        return numbers;
    }

    private static int nextReferenceNumber(String content) {
        OptionalInt maximum = parseEntries(List.of(referenceSection(content))).stream()
                .filter(entry -> entry.number() != null)
                .mapToInt(ParsedEntry::number)
                .max();
        if (maximum.isPresent()) return maximum.getAsInt() + 1;
        return parseEntries(List.of(referenceSection(content))).size() + 1;
    }

    private static PaperSection referenceSection(String content) {
        PaperSection section = new PaperSection();
        section.setActive(true);
        section.setSectionTitle("References");
        section.setSectionType(PaperSectionType.REFERENCE);
        section.setContentTex(content == null ? "" : content);
        return section;
    }

    private static String appendReference(String content, int number, Document source) {
        String current = content == null ? "" : content.stripTrailing();
        String separator = current.isBlank() ? "" : "\n";
        return current + separator + "- [" + number + "] "
                + CitationBibliography.referenceText(source);
    }

    @Transactional
    public void remove(UUID paperId, UUID sourceId, UUID requesterId) {
        User requester = requireUser(requesterId);
        Document paper = requirePaper(paperId);
        requireStudentWriter(requester, paper.getProject());
        PaperReference reference = paperReferenceRepository.findByPaperIdAndSourceId(paperId, sourceId)
                .orElseThrow(() -> new ResourceNotFoundException(sourceId, "PaperReference"));
        String citationKey = SourceMatchingService.citationKey(sourceId);
        boolean cited = CitationBibliography.citationKeys(
                paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId)).contains(citationKey);
        if (cited) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "REFERENCE_IN_USE: remove \\cite{" + citationKey + "} from the paper before removing this reference");
        }
        paperReferenceRepository.delete(reference);
    }

    @Transactional(readOnly = true)
    public List<Document> referenceSources(UUID paperId) {
        Document paper = requirePaper(paperId);
        return sourceMatchingService.referenceSources(paper.getId());
    }

    @Transactional(readOnly = true)
    public List<Document> retrievableReferenceSources(UUID paperId) {
        Document paper = requirePaper(paperId);
        return sourceMatchingService.retrievableReferenceSources(paper.getId());
    }

    private User requireUser(UUID requesterId) {
        return userRepository.findById(requesterId)
                .orElseThrow(() -> new ResourceNotFoundException(requesterId, "User"));
    }

    private Document requirePaper(UUID paperId) {
        Document paper = documentRepository.findById(paperId)
                .orElseThrow(() -> new ResourceNotFoundException(paperId, "Paper"));
        validatePaper(paper);
        return paper;
    }

    private void validatePaper(Document paper) {
        if (!paper.isActive() || paper.getDocType() != DocumentType.PAPER || paper.getProject() == null) {
            throw new ResourceNotFoundException(paper.getId(), "Paper");
        }
    }

    private PaperReferenceResponse response(
            PaperReference reference, User requester, Project project, Integer citationNumber) {
        Document source = reference.getSource();
        boolean canAttach = false;
        if (source.getProcessingStatus() == ProcessingStatus.METADATA_FETCHED) {
            try {
                requireStudentWriter(requester, project);
                boolean direct = source.getProject() != null && project.getId().equals(source.getProject().getId());
                boolean personalOwner = source.getProject() == null && source.getCollection() == null
                        && source.getUploadedBy() != null && requester.getId().equals(source.getUploadedBy().getId());
                canAttach = direct || personalOwner || currentUserService.isAdmin(requester);
                if (canAttach) {
                    canAttach = projectDocumentRepository.findByDocumentId(source.getId()).stream()
                            .noneMatch(link -> link.getProject().getStatus().isReadOnly()
                                    || link.getProject().getStatus() == ProjectStatus.SUBMITTED_FOR_REVIEW);
                }
            } catch (ResponseStatusException denied) {
                canAttach = false;
            }
        }
        return PaperReferenceResponse.from(reference, canAttach, citationNumber);
    }

    private void requireStudentWriter(User requester, Project project) {
        if (project.getStatus().isReadOnly()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is read-only.");
        }
        if (project.getStatus() == ProjectStatus.SUBMITTED_FOR_REVIEW) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is locked and cannot be modified.");
        }
        if (currentUserService.isAdmin(requester)) {
            return;
        }
        boolean writer = requester.getRole() == UserRole.STUDENT
                && projectMemberRepository.findByProjectIdAndUserId(project.getId(), requester.getId()).stream()
                        .anyMatch(member -> member.getRole() == ProjectRole.LEADER
                                || member.getRole() == ProjectRole.MEMBER);
        if (!writer) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Write access denied to project");
        }
    }

    private Document requireVisibleSource(Project project, UUID sourceId) {
        Document source = documentRepository.findById(sourceId)
                .orElseThrow(() -> new ResourceNotFoundException(sourceId, "Source"));
        if (!source.isActive() || source.getDocType() != DocumentType.SOURCE) {
            throw new ResourceNotFoundException(sourceId, "Source");
        }
        boolean direct = source.getProject() != null && project.getId().equals(source.getProject().getId());
        boolean shared = projectDocumentRepository
                .findByProjectIdAndDocumentId(project.getId(), sourceId).isPresent();
        if (!direct && !shared) {
            throw new ResourceNotFoundException(sourceId, "Source");
        }
        return source;
    }
}
