package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.PaperSectionResponse;
import com.evidencepilot.dto.response.PaperStandardSuggestionResponse;
import com.evidencepilot.dto.response.PaperValidationResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.AuditService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.PaperProcessingService;
import com.evidencepilot.service.PaperStandardService;
import com.evidencepilot.service.SystemNotificationService;
import com.evidencepilot.service.TexArchiveBuilder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class PaperProcessingServiceImpl implements PaperProcessingService {

    private static final Pattern MARKDOWN_HEADING = Pattern.compile(
            "(?m)^(#{1,6})\\h+(.+?)\\h*(?:\\R|$)");
    private static final Pattern HEADING_NUMBER = Pattern.compile(
            "^(?:\\d+(?:\\.\\d+)*|[IVXLCDM]+)[.)]?\\h+",
            Pattern.CASE_INSENSITIVE);
    private static final List<String> ACADEMIC_TOP_LEVEL_SECTIONS = List.of(
            "Conclusions and future work",
            "Conclusion and future work",
            "Results and discussion",
            "Discussion and conclusions",
            "Introduction and background",
            "Research methodology",
            "Materials and methods",
            "Material and methods",
            "Methods and materials",
            "Supplementary material",
            "Literature review",
            "Related work",
            "Acknowledgements",
            "Acknowledgments",
            "Introduction",
            "Background",
            "Methodology",
            "Methods",
            "Results",
            "Discussion",
            "Conclusions",
            "Conclusion",
            "Abstract",
            "References",
            "Bibliography",
            "Works Cited",
            "Appendices",
            "Appendix");

    private final PaperSectionRepository paperSectionRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final DocumentRepository documentRepository;
    private final CurrentUserService currentUserService;
    private final PaperStandardService paperStandardService;
    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final SystemNotificationService systemNotificationService;
    private final TexArchiveBuilder texArchiveBuilder;
    private final EvidenceTraceService evidenceTraceService;
    private final AuditService auditService;

    @Override
    public List<PaperSectionResponse> getPaperSections(UUID documentId) {
        requireDocumentAccess(documentId);
        return paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId).stream()
                .filter(PaperSection::isActive)
                .map(PaperSectionResponse::from)
                .toList();
    }

    @Override
    @Transactional
    public List<PaperSectionResponse> detectAndPersistSections(UUID documentId) {
        return detectAndPersistSections(documentId, List.of());
    }

    @Override
    @Transactional
    public List<PaperSectionResponse> detectAndPersistSections(
            UUID documentId,
            List<AiModelClient.ExtractionBlock> blocks) {
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException(documentId, "Document"));
        List<PaperSection> existing = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(documentId);
        if (!existing.isEmpty()) {
            return existing.stream()
                    .map(PaperSectionResponse::from)
                    .toList();
        }
        String text = document.getDocumentText() != null
                ? document.getDocumentText().getExtractedText() : null;
        if (text == null || text.isBlank()) {
            return List.of();
        }
        List<PaperSection> sections = parseSections(text, document, blocks);
        return paperSectionRepository.saveAll(sections).stream()
                .map(PaperSectionResponse::from)
                .toList();
    }

    private List<PaperSection> parseSections(
            String text,
            Document document,
            List<AiModelClient.ExtractionBlock> blocks) {
        Set<String> topLevelHeadings = structuredTopLevelHeadings(blocks);
        if (!topLevelHeadings.isEmpty()) {
            List<PaperSection> structured = parseStructuredMarkdownSections(
                    text, document, topLevelHeadings);
            if (!structured.isEmpty()) {
                return structured;
            }
        }

        Pattern pattern = Pattern.compile(
                "(?m)^(?:\\\\section\\*?\\{([^{}\\r\\n]+)}|(?:#{1,6}\\h+)?([A-Z][A-Za-z ]+))\\h*(?:\\R|$)");
        Matcher matcher = pattern.matcher(text);

        List<PaperSection> sections = new ArrayList<>();
        int index = 0;
        int lastEnd = 0;

        while (matcher.find()) {
            String sectionName = (matcher.group(1) != null ? matcher.group(1) : matcher.group(2)).trim();
            int start = matcher.start();

            if (index > 0) {
                sections.get(index - 1).setContentTex(text.substring(lastEnd, start).trim());
            }

            PaperSection section = new PaperSection();
            section.setDocument(document);
            section.setSectionOrder(index);
            section.setSectionTitle(sectionName);
            sections.add(section);

            lastEnd = matcher.end();
            index++;
        }

        if (!sections.isEmpty()) {
            sections.get(sections.size() - 1).setContentTex(text.substring(lastEnd).trim());
        }

        if (sections.isEmpty()) {
            PaperSection section = new PaperSection();
            section.setDocument(document);
            section.setSectionOrder(0);
            section.setSectionTitle("Full Text");
            section.setContentTex(text);
            sections.add(section);
        }

        return sections;
    }

    private Set<String> structuredTopLevelHeadings(List<AiModelClient.ExtractionBlock> blocks) {
        if (blocks == null || blocks.isEmpty()) {
            return Set.of();
        }

        List<AiModelClient.ExtractionBlock> headings = blocks.stream()
                .filter(block -> "heading".equals(block.type()))
                .toList();
        if (headings.isEmpty()) {
            return Set.of();
        }

        int minimumLevel = headings.stream()
                .mapToInt(AiModelClient.ExtractionBlock::level)
                .min()
                .orElse(1);
        long minimumCount = headings.stream()
                .filter(block -> block.level() == minimumLevel)
                .count();
        int sectionLevel = minimumLevel;
        if (minimumCount == 1) {
            sectionLevel = headings.stream()
                    .mapToInt(AiModelClient.ExtractionBlock::level)
                    .filter(level -> level > minimumLevel)
                    .min()
                    .orElse(minimumLevel);
        }

        int resolvedSectionLevel = sectionLevel;
        LinkedHashSet<String> selected = new LinkedHashSet<>();
        for (AiModelClient.ExtractionBlock block : headings) {
            if (block.level() == resolvedSectionLevel) {
                selected.add(normalizeHeading(block.text()));
            }
        }
        for (AiModelClient.ExtractionBlock block : blocks) {
            if ("reference".equals(block.type()) && academicHeading(block.text()) != null) {
                selected.add(normalizeHeading(block.text()));
            }
        }
        return selected;
    }

    private List<PaperSection> parseStructuredMarkdownSections(
            String text,
            Document document,
            Set<String> topLevelHeadings) {
        Matcher matcher = MARKDOWN_HEADING.matcher(text);
        List<PaperSection> sections = new ArrayList<>();
        int lastEnd = 0;
        String contentPrefix = "";

        while (matcher.find()) {
            String rawHeading = matcher.group(2).trim();
            if (!topLevelHeadings.contains(normalizeHeading(rawHeading))) {
                continue;
            }

            if (!sections.isEmpty()) {
                setSectionContent(
                        sections.get(sections.size() - 1),
                        contentPrefix,
                        text.substring(lastEnd, matcher.start()));
            }

            DetectedHeading detected = academicHeading(rawHeading);
            if (detected == null) {
                detected = new DetectedHeading(stripHeadingNumber(rawHeading), "");
            }

            PaperSection section = new PaperSection();
            section.setDocument(document);
            section.setSectionOrder(sections.size());
            section.setSectionTitle(detected.title());
            sections.add(section);

            contentPrefix = detected.remainder().isBlank()
                    ? ""
                    : matcher.group(1) + " " + detected.remainder();
            lastEnd = matcher.end();
        }

        if (!sections.isEmpty()) {
            setSectionContent(
                    sections.get(sections.size() - 1),
                    contentPrefix,
                    text.substring(lastEnd));
        }
        return sections;
    }

    private static void setSectionContent(PaperSection section, String prefix, String body) {
        String content = body.strip();
        if (!prefix.isBlank()) {
            content = content.isBlank() ? prefix : prefix + "\n\n" + content;
        }
        section.setContentTex(content);
    }

    private static DetectedHeading academicHeading(String rawHeading) {
        String heading = stripHeadingNumber(rawHeading);
        String appendix = "Appendix";
        if (heading.length() > appendix.length()
                && heading.regionMatches(true, 0, appendix, 0, appendix.length())
                && Character.isWhitespace(heading.charAt(appendix.length()))) {
            return new DetectedHeading(
                    appendix + " " + heading.substring(appendix.length()).trim(), "");
        }
        for (String title : ACADEMIC_TOP_LEVEL_SECTIONS) {
            if (heading.equalsIgnoreCase(title)) {
                return new DetectedHeading(title, "");
            }
            if (heading.length() > title.length()
                    && heading.regionMatches(true, 0, title, 0, title.length())
                    && Character.isWhitespace(heading.charAt(title.length()))) {
                return new DetectedHeading(title, heading.substring(title.length()).trim());
            }
        }
        return null;
    }

    private static String stripHeadingNumber(String heading) {
        return HEADING_NUMBER.matcher(heading.strip()).replaceFirst("");
    }

    private static String normalizeHeading(String heading) {
        return heading.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private record DetectedHeading(String title, String remainder) {
    }

    @Override
    public List<PaperSectionResponse> getPaperSectionsByUser(UUID documentId, UUID userId) {
        requireDocumentAccess(documentId);
        return paperSectionRepository
                .findByDocumentIdAndAssignedUserIdOrderBySectionOrderAsc(documentId, userId)
                .stream()
                .filter(PaperSection::isActive)
                .map(PaperSectionResponse::from)
                .toList();
    }

    @Override
    public PaperSectionResponse getSectionHistory(UUID documentId, UUID sectionId) {
        requireDocumentAccess(documentId);
        PaperSection section = requireSectionInDocument(sectionId, documentId);
        return PaperSectionResponse.from(section);
    }

    @Override
    public PaperValidationResponse validateSections(UUID documentId) {
        Document document = requireDocumentAccess(documentId);
        Project project = document.getProject();
        if (project == null || project.getTargetStandard() == null) {
            return new PaperValidationResponse(true, List.of(), List.of(), List.of(), null);
        }

        PaperStandard standard = project.getTargetStandard();
        List<String> required = paperStandardService.getRequiredSections(standard);
        if (required.isEmpty()) {
            return new PaperValidationResponse(true, List.of(), List.of(), List.of(), standard);
        }

        List<PaperSection> sections = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(documentId);
        List<String> actualTitles = sections.stream()
                .map(s -> paperStandardService.normalizeSectionTitle(s.getSectionTitle()))
                .toList();

        List<String> missing = new ArrayList<>(required);
        missing.removeAll(actualTitles);

        List<String> extra = new ArrayList<>(actualTitles);
        extra.removeAll(required);

        LinkedHashSet<String> ordered = new LinkedHashSet<>(actualTitles);
        ordered.retainAll(required);
        List<String> orderedList = new ArrayList<>(ordered);
        List<String> expectedOrder = required.stream()
                .filter(orderedList::contains)
                .toList();
        List<String> outOfOrder = new ArrayList<>();
        for (int i = 0; i < orderedList.size() && i < expectedOrder.size(); i++) {
            if (!orderedList.get(i).equals(expectedOrder.get(i))) {
                outOfOrder.add(orderedList.get(i));
            }
        }

        boolean valid = missing.isEmpty() && extra.isEmpty() && outOfOrder.isEmpty();
        return new PaperValidationResponse(valid, missing, extra, outOfOrder, standard);
    }

    @Override
    @Transactional(readOnly = true)
    public PaperStandardSuggestionResponse suggestStandard(UUID documentId) {
        Document document = requireDocumentAccess(documentId);
        if (document.getDocType() != DocumentType.PAPER || !document.isActive()) {
            throw new ResourceNotFoundException(documentId, "Paper");
        }
        String extractedText = document.getDocumentText() == null
                ? null : document.getDocumentText().getExtractedText();
        return paperStandardService.suggestStandard(
                document.getOriginalFilename(), extractedText);
    }

    @Override
    @Transactional
    public PaperSectionResponse updateSection(UUID documentId, UUID sectionId,
            String title, Integer order, UUID mergeIntoId, String content,
            Long expectedRevision) {
        boolean structureChange = title != null || order != null || mergeIntoId != null;
        if (structureChange && content != null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Section structure and content must be updated separately.");
        }
        if (structureChange) {
            requireInstructorDocumentWriteAccess(documentId);
            requireSectionStructureUnlocked(documentId);
        } else {
            requireDocumentWriteAccess(documentId);
        }
        User currentUser = currentUserService.requireCurrentUser();

        if (mergeIntoId != null) {
            PaperSection target = requireSectionInDocument(mergeIntoId, documentId);
            PaperSection source = requireSectionInDocument(sectionId, documentId);
            if (hasFeedback(source)) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Cannot merge: the section has feedback. Unassign and clear feedback first.");
            }
            String mergedContent =
                    (target.getContentTex() != null ? target.getContentTex() : "")
                    + "\n\n" + (source.getContentTex() != null ? source.getContentTex() : "");
            PaperSection saved = persistContentRevision(target, mergedContent, currentUser);
            source.setActive(false);
            paperSectionRepository.save(source);
            return PaperSectionResponse.from(saved);
        }

        PaperSection section = requireSectionInDocument(sectionId, documentId);
        if (content != null) {
            currentUserService.requireSectionContentWriteAccess(currentUser, section);
            requireExpectedRevision(section, expectedRevision);
            if (Objects.equals(section.getContentTex(), content)) {
                return PaperSectionResponse.from(section);
            }
            return PaperSectionResponse.from(
                    persistContentRevision(section, content, currentUser));
        }
        if (!structureChange) {
            return PaperSectionResponse.from(section);
        }
        if (title != null && !title.isBlank()) {
            section.setSectionTitle(title);
        }
        if (order != null) {
            section.setSectionOrder(order);
        }
        section.setUpdatedAt(LocalDateTime.now());
        PaperSection saved = paperSectionRepository.save(section);
        paperSectionRepository.flush();
        return PaperSectionResponse.from(saved);
    }

    @Override
    @Transactional
    public PaperSectionResponse assignSection(UUID documentId, UUID sectionId, UUID assignedUserId) {
        Document document = requireInstructorDocumentWriteAccess(documentId);
        User currentUser = currentUserService.requireCurrentUser();
        PaperSection section = requireSectionInDocument(sectionId, documentId);
        if (assignedUserId != null) {
            User user = userRepository.findById(assignedUserId)
                    .orElseThrow(() -> new ResourceNotFoundException(assignedUserId, "User"));
            if (user.getRole() != com.evidencepilot.model.enums.UserRole.STUDENT) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Sections can only be assigned to students.");
            }
            currentUserService.requireProjectAccess(user, document.getProject());
            section.setAssignedUser(user);
        } else {
            section.setAssignedUser(null);
        }
        section.setUpdatedAt(LocalDateTime.now());
        PaperSectionResponse response = PaperSectionResponse.from(paperSectionRepository.save(section));
        if (assignedUserId != null) {
            Project project = document.getProject();
            if (project.getStatus() == ProjectStatus.CREATED) {
                project.setStatus(ProjectStatus.ASSIGNED);
                project.setUpdatedAt(LocalDateTime.now());
                projectRepository.save(project);
            }
            systemNotificationService.createNotification(
                    section.getAssignedUser(),
                    currentUser,
                    "SECTION_ASSIGNED",
                    sectionId,
                    currentUser.getEmail() + " assigned you to section \"" + section.getSectionTitle() + "\".");
        }
        return response;
    }

    @Override
    @Transactional
    public PaperSectionResponse rollbackSection(
            UUID documentId, UUID sectionId, Long expectedRevision) {
        requireDocumentWriteAccess(documentId);
        User currentUser = currentUserService.requireCurrentUser();
        PaperSection section = requireSectionInDocument(sectionId, documentId);
        currentUserService.requireSectionContentWriteAccess(currentUser, section);
        requireExpectedRevision(section, expectedRevision);
        if (section.getPreviousContentTex() == null
                || Objects.equals(section.getContentTex(), section.getPreviousContentTex())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "No different previous save to restore.");
        }
        return PaperSectionResponse.from(
                persistContentRevision(section, section.getPreviousContentTex(), currentUser));
    }

    @Override
    @Transactional
    public void deleteSection(UUID documentId, UUID sectionId) {
        Document document = requireInstructorDocumentWriteAccess(documentId);
        requireSectionStructureUnlocked(documentId);
        PaperSection section = requireSectionInDocument(sectionId, documentId);
        if (paperStandardService.hasStudentContent(section.getContentTex())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Section contains student work.");
        }
        if (hasFeedback(section)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Section has feedback.");
        }
        section.setActive(false);
        section.setUpdatedAt(LocalDateTime.now());
        paperSectionRepository.save(section);
    }

    @Override
    @Transactional
    public PaperSectionResponse createSection(UUID documentId, String title, UUID parentSectionId) {
        Document document = requireInstructorDocumentWriteAccess(documentId);
        requireSectionStructureUnlocked(documentId);
        if (parentSectionId != null) {
            requireSectionInDocument(parentSectionId, documentId);
        }
        List<PaperSection> existing = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(documentId);
        int maxOrder = existing.stream()
                .mapToInt(PaperSection::getSectionOrder)
                .max()
                .orElse(-1);

        PaperSection section = new PaperSection();
        section.setDocument(document);
        section.setSectionTitle(title != null ? title : "New Section");
        section.setSectionOrder(maxOrder + 1);
        PaperStandard standard = document.getProject().getTargetStandard();
        section.setContentTex(paperStandardService.getSectionTemplate(
                standard == null ? PaperStandard.CUSTOM : standard,
                section.getSectionTitle()));
        section.setUpdatedAt(LocalDateTime.now());
        return PaperSectionResponse.from(paperSectionRepository.save(section));
    }

    @Override
    @Transactional
    public List<PaperSectionResponse> createSectionsFromStandard(UUID documentId, String standard) {
        Document document = requireInstructorDocumentWriteAccess(documentId);
        List<PaperSection> existing = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(documentId);
        requireSectionStructureUnlocked(existing);
        PaperStandard paperStandard;
        try {
            paperStandard = PaperStandard.valueOf(standard);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown standard: " + standard);
        }
        if (document.getProject() != null) {
            document.getProject().setTargetStandard(paperStandard);
            projectRepository.save(document.getProject());
        }

        List<String> requiredSections = paperStandardService.getRequiredSections(paperStandard);
        if (requiredSections.isEmpty()) {
            return List.of();
        }

        int startOrder = existing.stream()
                .mapToInt(PaperSection::getSectionOrder)
                .max()
                .orElse(-1) + 1;

        List<PaperSection> sections = new ArrayList<>();
        for (int i = 0; i < requiredSections.size(); i++) {
            PaperSection section = new PaperSection();
            section.setDocument(document);
            section.setSectionTitle(requiredSections.get(i));
            section.setSectionOrder(startOrder + i);
            section.setContentTex(
                    paperStandardService.getSectionTemplate(
                            paperStandard, section.getSectionTitle()));
            section.setUpdatedAt(LocalDateTime.now());
            sections.add(section);
        }

        return paperSectionRepository.saveAll(sections).stream()
                .map(PaperSectionResponse::from)
                .toList();
    }

    @Override
    @Transactional
    public List<PaperSectionResponse> resetSectionsForStandard(UUID projectId, String standard) {
        // 1. Validate the standard value early — fail fast before any DB writes.
        PaperStandard paperStandard;
        try {
            paperStandard = PaperStandard.valueOf(standard);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown standard: " + standard);
        }

        // 2. Resolve the project and verify the caller has write access.
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        User currentUser = currentUserService.requireCurrentUser();
        if (!currentUserService.isInstructor(currentUser)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only instructors can reset paper templates.");
        }
        currentUserService.requireProjectWriteAccess(currentUser, project);

        // 3. Find the project's single active Paper (1 Project : 1 Paper invariant).
        List<Document> papers = documentRepository
                .findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER);

        // 4. No paper exists yet — create a stub and generate sections (same flow as /papers/init).
        if (papers.isEmpty()) {
            Document stub = new Document();
            stub.setProject(project);
            stub.setUploadedBy(currentUser);
            stub.setDocType(DocumentType.PAPER);
            stub.setFileUrl("placeholder");
            stub.setOriginalFilename("_standard_" + paperStandard.name() + ".tex");
            stub.setContentType("text/plain");
            stub.setFileSizeBytes(0L);
            stub.setProcessingStatus(ProcessingStatus.READY);
            stub.setActive(true);
            stub.setCreatedAt(java.time.LocalDateTime.now());
            stub.setDownloadToken(UUID.randomUUID().toString());
            stub = documentRepository.save(stub);
            return createSectionsFromStandard(stub.getId(), standard);
        }

        Document paper = papers.getFirst();
        // update filename to reflect the new standard
        paper.setOriginalFilename("_standard_" + paperStandard.name() + ".tex");
        paper = documentRepository.save(paper);

        // 5. Load all current sections for the paper.
        List<PaperSection> existingSections = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(paper.getId());

        // 6. Guard: refuse if any section is currently assigned to a student.
        //    The frontend enforces this via hasAssignedSections lock, but the backend
        //    must be the authoritative gate to prevent data loss from direct API calls.
        requireSectionStructureUnlocked(existingSections);

        // guard — refuse if any section contains student work content
        boolean hasContent = existingSections.stream()
                .anyMatch(section -> paperStandardService.hasStudentContent(
                        section.getContentTex()));
        if (hasContent) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot reset standard: one or more sections contain student work. "
                    + "Clear section content before changing the standard.");
        }

        boolean hasFeedback = existingSections.stream().anyMatch(this::hasFeedback);
        if (hasFeedback) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Cannot reset standard: one or more sections have instructor feedback.");
        }

        // 7. Hard-delete all PaperSection rows for this paper.
        //    Soft-delete (active=false) cannot be used: createSectionsFromStandard
        //    computes startOrder from ALL rows (no active filter), so inactive rows
        //    would cause an off-by-N offset on the new sections.
        paperSectionRepository.deleteByDocumentId(paper.getId());

        // 9. Re-create sections from the new standard on a now-clean paper.
        //    createSectionsFromStandard now starts at sectionOrder = 0.
        return createSectionsFromStandard(paper.getId(), standard);
    }

    private void advanceProjectStatusOnStudentContent(Project project, PaperSection section, User currentUser) {
        if (project == null || section.getAssignedUser() == null
                || currentUser.getRole() != com.evidencepilot.model.enums.UserRole.STUDENT
                || project.getStatus() != ProjectStatus.ASSIGNED) {
            return;
        }
        project.setStatus(ProjectStatus.IN_PROGRESS);
        project.setUpdatedAt(LocalDateTime.now());
        projectRepository.save(project);
    }

    private PaperSection persistContentRevision(
            PaperSection section, String content, User editor) {
        String previousContent = section.getContentTex();
        section.setPreviousContentTex(previousContent);
        section.setContentTex(content);
        section.setContentMdCache(null);
        section.setVersion(section.getVersion() == null ? 1 : section.getVersion() + 1);
        section.setUpdatedAt(LocalDateTime.now());
        PaperSection saved = paperSectionRepository.save(section);
        paperSectionRepository.flush();
        advanceProjectStatusOnStudentContent(
                section.getDocument().getProject(), section, editor);
        evidenceTraceService.stampStaleOnContentChanged(
                saved.getId(), saved.getContentTex(), saved.getVersion());
        recordContentEdit(
                section.getDocument().getProject(), saved, editor,
                previousContent, saved.getContentTex());
        return saved;
    }

    private void requireExpectedRevision(PaperSection section, Long expectedRevision) {
        if (expectedRevision == null || expectedRevision < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "SECTION_REVISION_REQUIRED: expectedRevision must be zero or greater");
        }
        if (!Objects.equals(section.getOptVersion(), expectedRevision)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "SECTION_REVISION_CONFLICT: the section changed after it was loaded");
        }
    }

    private static int wordCount(String content) {
        return words(content).length;
    }

    private void recordContentEdit(Project project, PaperSection section, User editor,
            String beforeContent, String afterContent) {
        if (project == null || Objects.equals(beforeContent, afterContent)) return;
        ContentWordDelta delta = contentWordDelta(beforeContent, afterContent);
        auditService.record(
                "SECTION_CONTENT_UPDATED",
                "PROJECT",
                project.getId(),
                editor,
                null,
                Map.of(
                        "sectionId", section.getId(),
                        "sectionTitle", section.getSectionTitle(),
                        "beforeWordCount", delta.beforeCount(),
                        "afterWordCount", delta.afterCount(),
                        "wordDelta", delta.afterCount() - delta.beforeCount(),
                        "wordsAdded", delta.added(),
                        "wordsRemoved", delta.removed(),
                        "contentFingerprint", contentFingerprint(afterContent)));
    }

    private static ContentWordDelta contentWordDelta(String beforeContent, String afterContent) {
        String[] beforeWords = words(beforeContent);
        String[] afterWords = words(afterContent);
        Map<String, Integer> beforeCounts = tokenCounts(beforeWords);
        Map<String, Integer> afterCounts = tokenCounts(afterWords);
        int added = 0;
        int removed = 0;
        for (Map.Entry<String, Integer> entry : afterCounts.entrySet()) {
            added += Math.max(entry.getValue() - beforeCounts.getOrDefault(entry.getKey(), 0), 0);
        }
        for (Map.Entry<String, Integer> entry : beforeCounts.entrySet()) {
            removed += Math.max(entry.getValue() - afterCounts.getOrDefault(entry.getKey(), 0), 0);
        }
        return new ContentWordDelta(beforeWords.length, afterWords.length, added, removed);
    }

    private static String[] words(String content) {
        return content == null || content.isBlank() ? new String[0] : content.trim().split("\\s+");
    }

    private static Map<String, Integer> tokenCounts(String[] words) {
        Map<String, Integer> counts = new HashMap<>();
        for (String word : words) counts.merge(word, 1, Integer::sum);
        return counts;
    }

    private record ContentWordDelta(int beforeCount, int afterCount, int added, int removed) {}

    private static String contentFingerprint(String content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest((content == null ? "" : content).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private PaperSection requireSectionInDocument(UUID sectionId, UUID documentId) {
        PaperSection section = paperSectionRepository.findById(sectionId)
                .orElseThrow(() -> new ResourceNotFoundException(sectionId, "PaperSection"));
        if (!documentId.equals(section.getDocument().getId())) {
            throw new ResourceNotFoundException(sectionId, "PaperSection");
        }
        return section;
    }

    private void requireSectionStructureUnlocked(UUID documentId) {
        requireSectionStructureUnlocked(
                paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId));
    }

    private void requireSectionStructureUnlocked(List<PaperSection> sections) {
        if (sections.stream().anyMatch(
                section -> section.isActive() && section.getAssignedUser() != null)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Section structure is locked while one or more sections are assigned. "
                    + "Unassign all sections before making structural changes.");
        }
    }

    private boolean hasFeedback(PaperSection section) {
        return instructorFeedbackRepository.findByRequestProjectId(
                        section.getDocument().getProject().getId()).stream()
                .anyMatch(feedback -> section.getId().equals(feedback.getSection().getId()));
    }

    private Document requireDocumentAccess(UUID documentId) {
        User currentUser = currentUserService.requireCurrentUser();
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException(documentId, "Document"));
        if (document.getProject() != null) {
            currentUserService.requireProjectAccess(currentUser, document.getProject());
            return document;
        }
        currentUserService.requireUserIdOrAdmin(currentUser, document.getUploadedBy().getId());
        return document;
    }

    private Document requireDocumentWriteAccess(UUID documentId) {
        Document document = requireDocumentAccess(documentId);
        if (document.getProject() != null) {
            currentUserService.requireProjectWriteAccess(
                    currentUserService.requireCurrentUser(), document.getProject());
        }
        return document;
    }

    private Document requireInstructorDocumentWriteAccess(UUID documentId) {
        Document document = requireDocumentAccess(documentId);
        User currentUser = currentUserService.requireCurrentUser();
        if (!currentUserService.isInstructor(currentUser)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only instructors can manage section structure, assignment, and templates.");
        }
        currentUserService.requireProjectWriteAccess(currentUser, document.getProject());
        return document;
    }

    @Override
    public Path exportTexArchive(UUID projectId) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireProjectAccess(currentUser, project);
        return texArchiveBuilder.build(projectId);
    }
}
