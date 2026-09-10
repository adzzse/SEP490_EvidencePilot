package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.PaperSectionResponse;
import com.evidencepilot.dto.response.PaperMetadataResponse;
import com.evidencepilot.dto.response.PaperStandardSuggestionResponse;
import com.evidencepilot.dto.response.PaperValidationResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentMetadata;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.DocumentMetadataRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.SectionStandardEvaluationRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.AuditService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.PaperProcessingService;
import com.evidencepilot.service.FeedbackAnchorService;
import com.evidencepilot.dto.request.SectionContentUpdateRequest.TextChange;
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
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
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

    private static final Pattern LATEX_SECTION = Pattern.compile(
            "(?m)^\\\\section\\*?\\{([^{}\\r\\n]+)}");

    private final PaperSectionRepository paperSectionRepository;
    private final DocumentMetadataRepository documentMetadataRepository;
    private final BlockTreeIngestor blockTreeIngestor;
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
    private final SectionStandardEvaluationRepository sectionStandardEvaluationRepository;
    private final FeedbackAnchorService feedbackAnchorService;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

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
        serializeProjectWrite(document.getProject());
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
        List<PaperSection> sections;
        if (blocks == null || blocks.isEmpty()) {
            // LaTeX path (or degenerate bundle): structured \section commands only.
            // LaTeX preamble (\documentclass…) is markup, not content — intentionally skipped.
            sections = parseLatexSections(text, document);
        } else {
            BlockTreeIngestor.IngestionResult result = blockTreeIngestor.ingest(document, blocks);
            documentMetadataRepository.save(result.metadata());
            sections = result.sections();
            if (sections.isEmpty()) {
                PaperSection section = new PaperSection();
                section.setDocument(document);
                section.setSectionOrder(BlockTreeIngestor.ORDER_STEP);
                section.setSectionTitle("Full Text");
                section.setHeadingLevel(2);
                section.setContentTex(text);
                sections.add(section);
            }
        }
        return paperSectionRepository.saveAll(sections).stream()
                .map(PaperSectionResponse::from)
                .toList();
    }

    private List<PaperSection> parseLatexSections(String text, Document document) {
        Matcher matcher = LATEX_SECTION.matcher(text);

        List<PaperSection> sections = new ArrayList<>();
        int index = 0;
        int lastEnd = 0;

        while (matcher.find()) {
            String sectionName = matcher.group(1).trim();
            int start = matcher.start();

            if (index > 0) {
                sections.get(index - 1).setContentTex(text.substring(lastEnd, start).trim());
            }

            PaperSection section = new PaperSection();
            section.setDocument(document);
            section.setSectionOrder((index + 1) * BlockTreeIngestor.ORDER_STEP);
            section.setSectionTitle(sectionName);
            section.setHeadingLevel(2);
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
            section.setSectionOrder(BlockTreeIngestor.ORDER_STEP);
            section.setSectionTitle("Full Text");
            section.setHeadingLevel(2);
            section.setContentTex(text);
            sections.add(section);
        }

        return sections;
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
    @Transactional(readOnly = true)
    public PaperMetadataResponse getPaperMetadata(UUID documentId) {
        Document document = requireDocumentAccess(documentId);
        java.util.Optional<DocumentMetadata> metadata =
                documentMetadataRepository.findByDocumentId(documentId);
        String title = metadata.map(DocumentMetadata::getTitle)
                .filter(value -> value != null && !value.isBlank())
                .orElse(document.getTitle());
        List<PaperMetadataResponse.AuthorEntry> authors = parseAuthorEntries(
                metadata.map(DocumentMetadata::getAuthorsJson).orElse("[]"));
        if (authors.isEmpty() && document.getAuthors() != null && !document.getAuthors().isBlank()) {
            authors = List.of(new PaperMetadataResponse.AuthorEntry(
                    document.getAuthors().strip(), List.of(), List.of()));
        }
        return new PaperMetadataResponse(
                documentId,
                title,
                authors,
                metadata.map(DocumentMetadata::getKeywords).orElse(null),
                document.getDoi(),
                document.getPublisher(),
                document.getPublicationYear());
    }

    private List<PaperMetadataResponse.AuthorEntry> parseAuthorEntries(String json) {
        try {
            com.fasterxml.jackson.databind.JsonNode root =
                    objectMapper.readTree(json == null || json.isBlank() ? "[]" : json);
            if (!root.isArray()) {
                return List.of();
            }
            List<PaperMetadataResponse.AuthorEntry> authors = new ArrayList<>();
            for (com.fasterxml.jackson.databind.JsonNode node : root) {
                String name = node.path("name").asText("").strip();
                if (name.isBlank()) {
                    continue;
                }
                authors.add(new PaperMetadataResponse.AuthorEntry(
                        name.length() > 500 ? name.substring(0, 500) : name,
                        textList(node.path("affiliations")),
                        textList(node.path("emails"))));
            }
            return authors;
        } catch (Exception exception) {
            // ponytail: metadata must never break the paper display; fall back to empty.
            return List.of();
        }
    }

    private static List<String> textList(com.fasterxml.jackson.databind.JsonNode array) {
        if (array == null || !array.isArray()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (com.fasterxml.jackson.databind.JsonNode item : array) {
            String value = item.asText("").strip();
            if (!value.isBlank()) {
                values.add(value);
            }
        }
        return values;
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
                // Keywords and the Paper Info snapshot live in document_metadata —
                // never flag them as extra sections.
                .filter(title -> !"keywords".equalsIgnoreCase(title)
                        && !"paper info".equalsIgnoreCase(title))
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
        return updateSection(documentId, sectionId, title, order, mergeIntoId, content, expectedRevision, null);
    }

    @Override
    @Transactional
    public PaperSectionResponse updateSection(UUID documentId, UUID sectionId,
            String title, Integer order, UUID mergeIntoId, String content,
            Long expectedRevision, List<TextChange> changes) {
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
            clearHandoff(source);
            paperSectionRepository.save(source);
            return PaperSectionResponse.from(saved);
        }

        PaperSection section = requireSectionInDocument(sectionId, documentId);
        if (content != null) {
            currentUserService.requireSectionContentWriteAccess(currentUser, section);
            requireExpectedRevision(section, expectedRevision);
            FeedbackAnchorService.validateChanges(section.getContentTex(), content, changes);
            if (Objects.equals(section.getContentTex(), content)) {
                return PaperSectionResponse.from(section);
            }
            return PaperSectionResponse.from(
                    persistContentRevision(section, content, currentUser, changes));
        }
        if (!structureChange) {
            return PaperSectionResponse.from(section);
        }
        if (order != null && order < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Section order must be non-negative");
        }
        boolean changed = false;
        if (title != null && !title.isBlank() && !title.equals(section.getSectionTitle())) {
            section.setSectionTitle(title);
            changed = true;
        }
        if (order != null && !order.equals(section.getSectionOrder())) {
            section.setSectionOrder(order);
            changed = true;
        }
        if (!changed) return PaperSectionResponse.from(section);
        clearHandoff(section);
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
        UUID previousAssigneeId = section.getAssignedUser() == null
                ? null : section.getAssignedUser().getId();
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
        if (!Objects.equals(previousAssigneeId, assignedUserId)) clearHandoff(section);
        section.setUpdatedAt(LocalDateTime.now());
        PaperSection saved = paperSectionRepository.save(section);
        paperSectionRepository.flush();
        PaperSectionResponse response = PaperSectionResponse.from(saved);
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
        clearHandoff(section);
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
                .orElse(0);

        PaperSection section = new PaperSection();
        section.setDocument(document);
        section.setSectionTitle(title != null ? title : "New Section");
        section.setSectionOrder(maxOrder + BlockTreeIngestor.ORDER_STEP);
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
                .orElse(0) + BlockTreeIngestor.ORDER_STEP;

        List<PaperSection> sections = new ArrayList<>();
        for (int i = 0; i < requiredSections.size(); i++) {
            PaperSection section = new PaperSection();
            section.setDocument(document);
            section.setSectionTitle(requiredSections.get(i));
            section.setSectionOrder(startOrder + i * BlockTreeIngestor.ORDER_STEP);
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
        serializeProjectWrite(project);

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
        //    createSectionsFromStandard now starts at the first order gap step.
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
        return persistContentRevision(section, content, editor, null);
    }

    private PaperSection persistContentRevision(
            PaperSection section, String content, User editor, List<TextChange> changes) {
        String previousContent = section.getContentTex();
        Integer previousVersion = section.getVersion();
        section.setPreviousContentTex(previousContent);
        section.setContentTex(content);
        section.setContentMdCache(null);
        section.setVersion(section.getVersion() == null ? 1 : section.getVersion() + 1);
        clearHandoff(section);
        section.setUpdatedAt(LocalDateTime.now());
        PaperSection saved = paperSectionRepository.save(section);
        paperSectionRepository.flush();
        feedbackAnchorService.contentChanged(section, previousContent, content, previousVersion, section.getVersion(), changes);
        advanceProjectStatusOnStudentContent(
                section.getDocument().getProject(), section, editor);
        evidenceTraceService.stampStaleOnContentChanged(
                saved.getId(), saved.getContentTex(), saved.getVersion());
        recordContentEdit(
                section.getDocument().getProject(), saved, editor,
                previousContent, saved.getContentTex());
        markSectionStandardStale(saved.getId());
        return saved;
    }

    private void markSectionStandardStale(UUID sectionId) {
        sectionStandardEvaluationRepository.findTopBySectionIdOrderByUpdatedAtDesc(sectionId)
                .ifPresent(eval -> {
                    eval.setStatus(com.evidencepilot.model.SectionStandardEvaluation.STATUS_STALE);
                    eval.setUpdatedAt(LocalDateTime.now());
                    sectionStandardEvaluationRepository.save(eval);
                });
    }

    private static void clearHandoff(PaperSection section) {
        section.setHandoffConfirmedBy(null);
        section.setHandoffConfirmedAt(null);
        section.setHandoffContentVersion(null);
        section.setHandoffInputFingerprint(null);
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
        // ponytail: write the section as the entity (not the project) so the activity
        // feed can resolve the section directly via PaperSection and render a
        // student-friendly "Section: X in Project Y" row.
        auditService.record(
                "SECTION_CONTENT_UPDATED",
                "PaperSection",
                section.getId(),
                editor,
                null,
                Map.of(
                        "sectionId", section.getId(),
                        "sectionTitle", section.getSectionTitle(),
                        "projectId", project.getId(),
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
            serializeProjectWrite(document.getProject());
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
        serializeProjectWrite(document.getProject());
        return document;
    }

    private void serializeProjectWrite(Project project) {
        if (project == null) return;
        project.setUpdatedAt(LocalDateTime.now());
        projectRepository.saveAndFlush(project);
    }

    @Override
    @Transactional
    public List<PaperSectionResponse> batchUpdateSections(UUID documentId, List<com.evidencepilot.dto.request.SectionBatchItem> items) {
        if (items == null || items.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Batch must contain at least one section");
        }
        Document document = requireDocumentAccess(documentId);
        Project project = document.getProject();
        List<PaperSection> persisted = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(documentId).stream()
                .filter(PaperSection::isActive)
                .toList();
        Map<UUID, PaperSection> persistedById = new HashMap<>();
        persisted.forEach(section -> persistedById.put(section.getId(), section));
        Set<UUID> requestedIds = new HashSet<>();
        Set<Integer> requestedOrders = new HashSet<>();
        for (var item : items) {
            if (!persistedById.containsKey(item.id())) {
                throw new ResourceNotFoundException(item.id(), "PaperSection");
            }
            if (!requestedIds.add(item.id())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Batch contains duplicate section id: " + item.id());
            }
            // Gap ordering: values need only be distinct and non-negative —
            // sorted position defines display order, contiguity is not required.
            if (item.sectionOrder() == null || item.sectionOrder() < 0
                    || !requestedOrders.add(item.sectionOrder())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Section orders must be unique and non-negative");
            }
            if (item.sectionTitle() == null || item.sectionTitle().isBlank()
                    || item.sectionTitle().trim().length() > 255) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Section title must contain 1 to 255 characters");
            }
            if (item.expectedRevision() == null || item.expectedRevision() < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "SECTION_REVISION_REQUIRED: expectedRevision must be zero or greater for " + item.id());
            }
        }
        if (requestedIds.size() != persistedById.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Batch must contain every active section exactly once");
        }

        boolean hasStructuralChange = false;
        boolean hasAssignChange = false;
        for (var item : items) {
            PaperSection cur = persistedById.get(item.id());
            if (!item.sectionOrder().equals(cur.getSectionOrder())) hasStructuralChange = true;
            if (!item.sectionTitle().trim().equals(cur.getSectionTitle())) hasStructuralChange = true;
            UUID curAssigned = cur.getAssignedUser() != null ? cur.getAssignedUser().getId() : null;
            if (!java.util.Objects.equals(item.assignedUserId(), curAssigned)) hasAssignChange = true;
        }
        if (hasStructuralChange) {
            requireInstructorDocumentWriteAccess(documentId);
            boolean currentlyLocked = persisted.stream().anyMatch(s -> s.getAssignedUser() != null);
            boolean remainsLocked = items.stream().anyMatch(item -> item.assignedUserId() != null);
            if (currentlyLocked && remainsLocked) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Section structure is locked while one or more sections are assigned. "
                                + "Unassign all sections before making structural changes.");
            }
        } else if (hasAssignChange) {
            requireInstructorDocumentWriteAccess(documentId);
        } else {
            requireDocumentWriteAccess(documentId);
        }

        for (var item : items) {
            PaperSection cur = persistedById.get(item.id());
            if (!java.util.Objects.equals(cur.getOptVersion(), item.expectedRevision())) {
                throw new com.evidencepilot.exception.SectionConflictException(item.id(), item.expectedRevision(), cur.getOptVersion());
            }
        }

        Map<UUID, User> assignees = new HashMap<>();
        for (var item : items) {
            PaperSection section = persistedById.get(item.id());
            UUID currentAssigneeId = section.getAssignedUser() != null ? section.getAssignedUser().getId() : null;
            if (item.assignedUserId() != null
                    && !Objects.equals(item.assignedUserId(), currentAssigneeId)
                    && !assignees.containsKey(item.assignedUserId())) {
                User assignee = userRepository.findById(item.assignedUserId())
                        .orElseThrow(() -> new ResourceNotFoundException(item.assignedUserId(), "User"));
                if (assignee.getRole() != com.evidencepilot.model.enums.UserRole.STUDENT) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sections can only be assigned to students.");
                }
                currentUserService.requireProjectAccess(assignee, project);
                assignees.put(assignee.getId(), assignee);
            }
        }
        User currentUser = currentUserService.requireCurrentUser();
        for (var item : items) {
            PaperSection section = persistedById.get(item.id());
            if (item.contentTex() != null && !Objects.equals(section.getContentTex(), item.contentTex())) {
                currentUserService.requireSectionContentWriteAccess(currentUser, section);
            }
        }

        List<PaperSection> toSave = new ArrayList<>();
        for (var item : items) {
            PaperSection section = persistedById.get(item.id());
            boolean changed = false;
            if (item.contentTex() != null && !Objects.equals(section.getContentTex(), item.contentTex())) {
                Integer previousVersion = section.getVersion();
                section.setPreviousContentTex(section.getContentTex());
                section.setContentTex(item.contentTex());
                section.setContentMdCache(null);
                section.setVersion(section.getVersion() == null ? 1 : section.getVersion() + 1);
                feedbackAnchorService.contentChanged(section, section.getPreviousContentTex(), section.getContentTex(),
                        previousVersion, section.getVersion(), null);
                advanceProjectStatusOnStudentContent(project, section, currentUser);
                recordContentEdit(project, section, currentUser, section.getPreviousContentTex(), section.getContentTex());
                evidenceTraceService.stampStaleOnContentChanged(section.getId(), section.getContentTex(), section.getVersion());
                markSectionStandardStale(section.getId());
                changed = true;
            }
            if (!item.sectionTitle().trim().equals(section.getSectionTitle())) {
                section.setSectionTitle(item.sectionTitle().trim());
                changed = true;
            }
            if (!item.sectionOrder().equals(section.getSectionOrder())) {
                section.setSectionOrder(item.sectionOrder());
                changed = true;
            }
            UUID currentAssigneeId = section.getAssignedUser() != null ? section.getAssignedUser().getId() : null;
            if (!Objects.equals(item.assignedUserId(), currentAssigneeId)) {
                User newAssignee = item.assignedUserId() == null ? null : assignees.get(item.assignedUserId());
                section.setAssignedUser(newAssignee);
                changed = true;
                if (newAssignee != null) {
                    systemNotificationService.createNotification(
                            newAssignee,
                            currentUser,
                            "SECTION_ASSIGNED",
                            section.getId(),
                            currentUser.getEmail() + " assigned you to section \"" + section.getSectionTitle() + "\".");
                }
            }
            if (changed) {
                clearHandoff(section);
                section.setUpdatedAt(LocalDateTime.now());
                toSave.add(section);
            }
        }
        if (!toSave.isEmpty()) {
            paperSectionRepository.saveAll(toSave);
            paperSectionRepository.flush();
        }
        boolean hasAssignedSection = items.stream().anyMatch(i -> i.assignedUserId() != null)
                || persistedById.values().stream().anyMatch(s -> s.getAssignedUser() != null);
        if (hasAssignedSection && project.getStatus() == ProjectStatus.CREATED) {
            project.setStatus(ProjectStatus.ASSIGNED);
            project.setUpdatedAt(LocalDateTime.now());
            projectRepository.save(project);
        }
        return paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId).stream()
                .filter(PaperSection::isActive)
                .map(PaperSectionResponse::from)
                .toList();
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
