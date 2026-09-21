package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.CitationValidationResponse;
import com.evidencepilot.dto.response.PaperValidationResponse;
import com.evidencepilot.model.*;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperSectionType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CitationValidationServiceImpl {

    private static final Pattern CITE_PATTERN = Pattern.compile("\\\\cite(?:\\[([^\\]]*)\\])?\\{([^}]+)\\}");
    private static final Pattern BIBITEM_PATTERN = Pattern.compile("\\\\bibitem(?:\\[([^\\]]*)\\])?\\{([^}]+)\\}");
    private static final Pattern BIBLIOGRAPHY_PATTERN = Pattern.compile("\\\\bibliography\\{([^}]+)\\}");

    private final DocumentRepository documentRepository;
    private final DocumentReferenceRepository documentReferenceRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final PaperProcessingServiceImpl paperProcessingService;
    private final CurrentUserServiceImpl currentUserService;
    private final SourceMatchingService sourceMatchingService;

    public CitationValidationResponse validateCitations(UUID documentId) {
        User currentUser = currentUserService.requireCurrentUser();
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new com.evidencepilot.exception.ResourceNotFoundException(documentId, "Document"));
        currentUserService.requireProjectAccess(currentUser, document.getProject());

        PaperValidationResponse sectionValidation = paperProcessingService.validateSections(documentId);

        List<PaperSection> sections = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(documentId);

        List<String> allCitedKeys = new ArrayList<>();
        List<String> bibitemKeys = new ArrayList<>();
        boolean hasExternalBib = false;

        for (PaperSection section : sections) {
            if (section.getContentTex() == null || section.getContentTex().isBlank()) continue;
            String tex = section.getContentTex();

            Matcher citeMatcher = CITE_PATTERN.matcher(tex);
            while (citeMatcher.find()) {
                addCitationKeys(allCitedKeys, citeMatcher.group(2));
            }

            Matcher bibMatcher = BIBITEM_PATTERN.matcher(tex);
            while (bibMatcher.find()) {
                bibitemKeys.add(bibMatcher.group(2).trim());
            }

            if (BIBLIOGRAPHY_PATTERN.matcher(tex).find()) {
                hasExternalBib = true;
            }
        }

        // fallback: if no section content found, scan document extractedText
        String extractedText = document.getDocumentText() != null ? document.getDocumentText().getExtractedText() : null;
        if (allCitedKeys.isEmpty() && extractedText != null && !extractedText.isBlank()) {
            String tex = extractedText;
            Matcher citeMatcher = CITE_PATTERN.matcher(tex);
            while (citeMatcher.find()) {
                addCitationKeys(allCitedKeys, citeMatcher.group(2));
            }
            Matcher bibMatcher = BIBITEM_PATTERN.matcher(tex);
            while (bibMatcher.find()) {
                bibitemKeys.add(bibMatcher.group(2).trim());
            }
            if (BIBLIOGRAPHY_PATTERN.matcher(tex).find()) {
                hasExternalBib = true;
            }
        }

        // deduplicate while preserving order
        Set<String> citedKeys = new LinkedHashSet<>(allCitedKeys);
        Set<String> definedKeys = new LinkedHashSet<>(bibitemKeys);

        int totalCitations = citedKeys.size();

        // build a lookup from project source DocumentReference titles/DOIs
        Project project = document.getProject();
        Set<String> sourceDois = new HashSet<>();
        Set<String> sourceTitles = new HashSet<>();
        Set<UUID> referenceIds = new HashSet<>();
        Set<UUID> retrievableReferenceIds = new HashSet<>();
        if (project != null) {
            for (Document reference : sourceMatchingService.referenceSources(documentId)) {
                referenceIds.add(reference.getId());
            }
            for (Document reference : sourceMatchingService.retrievableReferenceSources(documentId)) {
                retrievableReferenceIds.add(reference.getId());
            }
        }
        if (project != null && sectionValidation.standardUsed() != null) {
            List<DocumentReference> refs = documentReferenceRepository
                    .findByDocumentProjectIdAndDocumentDocTypeAndDocumentActiveTrueOrderByDocumentIdAscReferenceIndexAsc(
                            project.getId(), DocumentType.SOURCE);
            for (DocumentReference ref : refs) {
                if (ref.getDoi() != null && !ref.getDoi().isBlank()) {
                    sourceDois.add(ref.getDoi().toLowerCase().trim());
                }
                if (ref.getTitle() != null && !ref.getTitle().isBlank()) {
                    sourceTitles.add(normalize(ref.getTitle()));
                }
            }
        }


        List<String> missingCitations = new ArrayList<>();
        List<String> unmatchedKeys = new ArrayList<>();
        List<String> unavailableReferences = new ArrayList<>();

        for (String key : citedKeys) {
            Optional<UUID> citedId = SourceMatchingService.citationDocumentId(key);
            boolean autoCitation;
            boolean matchedSource;
            if (citedId.isPresent()) {
                autoCitation = retrievableReferenceIds.contains(citedId.get());
                matchedSource = autoCitation;
                if (!autoCitation && referenceIds.contains(citedId.get())) {
                    unavailableReferences.add(key);
                    continue;
                }
            } else {
                autoCitation = false;
                matchedSource = false;
                for (String doi : sourceDois) {
                    if (normalize(key).contains(normalize(doi))
                            || normalize(doi).contains(normalize(key))) {
                        matchedSource = true;
                        break;
                    }
                }
                if (!matchedSource) {
                    for (String title : sourceTitles) {
                        String normalizedKey = normalize(key);
                        if (normalizedKey.length() > 3 && title.contains(normalizedKey)) {
                            matchedSource = true;
                            break;
                        }
                    }
                }
            }
            if (!matchedSource) {
                missingCitations.add(key);
            }

            if (!definedKeys.contains(key) && !hasExternalBib && !autoCitation) {
                unmatchedKeys.add(key);
            }
        }

        int matchedCitations = totalCitations - missingCitations.size() - unavailableReferences.size();

        // per-standard format check
        List<String> formattingIssues = new ArrayList<>();
        PaperStandard standard = sectionValidation.standardUsed();
        if (standard != null && standard != PaperStandard.CUSTOM) {
            String allTex = sections.stream()
                    .filter(s -> s.getContentTex() != null)
                    .map(PaperSection::getContentTex)
                    .collect(Collectors.joining("\n"));

            String refSection = extractReferenceSection(sections);

            switch (standard) {
                case IEEE -> checkIeeeFormat(refSection, formattingIssues);
                case ACM -> checkAcmFormat(refSection, allTex, formattingIssues);
                case APA -> checkApaFormat(refSection, allTex, formattingIssues);
                case SPRINGER_LNCS, MLA -> {
                    // no format check for these
                }
            }
        }

        boolean hasCitations = totalCitations > 0;
        if (totalCitations == 0) {
            formattingIssues.add("No citations found in this section. Use \\cite{key} to add citations.");
        }
        return new CitationValidationResponse(
                hasCitations && missingCitations.isEmpty() && unmatchedKeys.isEmpty()
                        && unavailableReferences.isEmpty() && formattingIssues.isEmpty(),
                document.getTitle() != null ? document.getTitle() : document.getOriginalFilename(),
                totalCitations,
                matchedCitations,
                missingCitations,
                unmatchedKeys,
                unavailableReferences,
                formattingIssues,
                standard,
                sectionValidation);
    }

    private String extractReferenceSection(List<PaperSection> sections) {
        for (PaperSection section : sections) {
            if (section.getContentTex() == null) continue;
            if (section.getSectionType() == PaperSectionType.REFERENCE) {
                return section.getContentTex();
            }
        }
        return "";
    }

    private void checkIeeeFormat(String refSection, List<String> issues) {
        if (refSection.isBlank()) return;
        // IEEE expects [n] numbered references in the reference list
        Pattern ieeePattern = Pattern.compile("(?m)^\\s*\\[\\d+\\]");
        if (!ieeePattern.matcher(refSection).find()) {
            issues.add("IEEE format requires numbered references like [1] in the reference section.");
        }
    }

    private void checkAcmFormat(String refSection, String allTex, List<String> issues) {
        String tex = refSection.isBlank() ? allTex : refSection;
        // ACM uses [Author Year] style — look for [ word(s) \d{4} ] in references
        Pattern acmPattern = Pattern.compile("\\[\\w+(?:\\s+\\w+)*\\s+\\d{4}\\]");
        boolean foundNumeric = Pattern.compile("(?m)^\\s*\\[\\d+\\]").matcher(tex).find();
        boolean foundAuthorYear = acmPattern.matcher(tex).find();
        if (foundNumeric && !foundAuthorYear) {
            issues.add("ACM format expects [Author Year] citations, found numeric [n] style. Use \\cite{key} with BibTeX style 'acm'.");
        }
    }

    private void checkApaFormat(String refSection, String allTex, List<String> issues) {
        String tex = refSection.isBlank() ? allTex : refSection;
        // APA uses (Author, Year) parenthetical citations
        Pattern apaPattern = Pattern.compile("\\(\\w+[^)]*\\d{4}[^)]*\\)");
        boolean hasParenthetical = apaPattern.matcher(tex).find();
        boolean hasNumeric = Pattern.compile("(?m)^\\s*\\[\\d+\\]").matcher(tex).find();
        if (!hasParenthetical && !hasNumeric) {
            issues.add("APA format expects parenthetical citations like (Author, Year). Use \\cite{key} with BibTeX style 'apa'.");
        }
        if (hasNumeric && !hasParenthetical) {
            issues.add("APA format expects (Author, Year) citations, found numeric [n] style.");
        }
    }

    private static String normalize(String s) {
        return s.toLowerCase()
                .replaceAll("[^a-z0-9]", "")
                .trim();
    }

    private static void addCitationKeys(List<String> target, String keys) {
        Arrays.stream(keys.split(","))
                .map(String::trim)
                .filter(key -> !key.isBlank())
                .forEach(target::add);
    }
}
