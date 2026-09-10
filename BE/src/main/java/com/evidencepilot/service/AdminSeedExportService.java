package com.evidencepilot.service;

import com.evidencepilot.client.openalex.DoiUtils;
import com.evidencepilot.model.Collection;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.CollectionDocumentRepository;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.DocumentTextRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Backup-as-seed: exports live rows as a seed-ZIP-layout bundle
 * ({@code seed.xlsx} + {@code papers/<slug>/} files) that re-imports through
 * the existing Data Management seed upload with zero dry-run errors.
 *
 * <p>Only reimportable rows are emitted (valid student codes, DOI sources,
 * file-or-text-or-standard papers, non-empty collections); everything skipped
 * is tallied into the README sheet. Reimport targets a fresh database —
 * existing emails/DOIs are skipped as duplicates by the importer.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AdminSeedExportService {

    private static final int ABSTRACT_CAP = 5000;
    private static final Pattern STANDARD_STUB = Pattern.compile("^_standard_(.+)\\.tex$");

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository memberRepository;
    private final DocumentRepository documentRepository;
    private final DocumentTextRepository documentTextRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final CollectionRepository collectionRepository;
    private final CollectionDocumentRepository collectionDocumentRepository;
    private final DocumentObjectStorage documentObjectStorage;

    public record PaperFileEntry(String zipPath, String objectKey) {
    }

    public record SeedBundle(byte[] xlsx, List<PaperFileEntry> paperFiles, String summary) {
    }

    @Transactional(readOnly = true)
    public SeedBundle buildBundle(UUID projectId) throws IOException {
        List<Project> projects = projectId == null
                ? projectRepository.findAll().stream().filter(Project::isActive).toList()
                : projectRepository.findById(projectId).filter(Project::isActive).map(List::of).orElse(List.of());
        Set<UUID> projectIds = new LinkedHashSet<>();
        for (Project project : projects) projectIds.add(project.getId());

        List<ProjectMember> members = memberRepository.findAll().stream()
                .filter(m -> m.getProject() != null && projectIds.contains(m.getProject().getId()))
                .filter(m -> m.getUser() != null)
                .toList();

        List<Document> documents = documentRepository.findAll().stream()
                .filter(Document::isActive)
                .toList();
        List<Document> inScopeSources = documents.stream()
                .filter(d -> d.getDocType() == DocumentType.SOURCE)
                .filter(d -> d.getProject() != null && projectIds.contains(d.getProject().getId()))
                .toList();
        List<Document> inScopePapers = documents.stream()
                .filter(d -> d.getDocType() == DocumentType.PAPER)
                .filter(d -> d.getProject() != null && projectIds.contains(d.getProject().getId()))
                .toList();

        // Users referenced by members/owners only — orphans serve no seed purpose.
        Map<String, User> usersByEmail = new LinkedHashMap<>();
        for (ProjectMember member : members) {
            putUser(usersByEmail, member.getUser());
        }

        List<List<String>> userRows = new ArrayList<>();
        List<List<String>> memberRows = new ArrayList<>();
        int skippedUsers = 0;
        for (ProjectMember member : members) {
            User user = member.getUser();
            memberRows.add(List.of(
                    member.getProject().getTitle(),
                    user.getEmail() == null ? "" : user.getEmail().toLowerCase(Locale.ROOT),
                    member.getRole() == null ? "" : member.getRole().name()));
        }

        List<Collection> collections = collectionRepository.findAll().stream()
                .filter(Collection::isActive)
                .toList();
        for (Collection collection : collections) {
            if (collection.getInstructor() != null) putUser(usersByEmail, collection.getInstructor());
        }
        for (String email : new ArrayList<>(usersByEmail.keySet())) {
            User user = usersByEmail.get(email);
            if (user.getAccountStatus() == AccountStatus.DELETED) {
                usersByEmail.remove(email);
                skippedUsers++;
                continue;
            }
            String code = user.getStudentCode() == null ? "" : user.getStudentCode().trim().toUpperCase(Locale.ROOT);
            if (user.getRole() == UserRole.STUDENT && !code.matches("^[A-Z]{2}\\d{6}$")) {
                usersByEmail.remove(email);
                skippedUsers++;
                continue;
            }
            userRows.add(List.of(
                    email,
                    nullToEmpty(user.getFirstName()),
                    nullToEmpty(user.getLastName()),
                    user.getRole() == null ? "" : user.getRole().name(),
                    user.getRole() == UserRole.STUDENT ? code : "",
                    ""));
        }
        // Drop memberships whose user was skipped — commit would only row-error them.
        Set<String> keptEmails = usersByEmail.keySet();
        int skippedMembers = 0;
        List<List<String>> keptMemberRows = new ArrayList<>();
        for (List<String> row : memberRows) {
            if (keptEmails.contains(row.get(1))) keptMemberRows.add(row);
            else skippedMembers++;
        }

        List<List<String>> sourceRows = new ArrayList<>();
        Set<String> exportedDois = new LinkedHashSet<>();
        int skippedSources = 0;
        for (Document doc : inScopeSources) {
            String doi = DoiUtils.normalize(doc.getDoi());
            if (doi == null || doi.isBlank() || !DoiUtils.isValid(doi)) {
                skippedSources++;
                continue;
            }
            String text = null;
            try {
                var documentText = documentTextRepository.findByDocumentId(doc.getId());
                if (documentText != null) text = documentText.getExtractedText();
            } catch (RuntimeException e) {
                log.warn("Seed export: unreadable text for source {}", doc.getId());
            }
            if (text != null && text.length() > ABSTRACT_CAP) text = text.substring(0, ABSTRACT_CAP);
            sourceRows.add(List.of(
                    doc.getProject().getTitle(),
                    doi,
                    nullToEmpty(doc.getTitle()),
                    nullToEmpty(doc.getAuthors()),
                    doc.getPublicationYear() == null ? "" : String.valueOf(doc.getPublicationYear()),
                    nullToEmpty(doc.getPublisher()),
                    doc.getCitedByCount() == null ? "" : String.valueOf(doc.getCitedByCount()),
                    text == null ? "" : text));
            exportedDois.add(doi.toLowerCase(Locale.ROOT));
        }

        List<List<String>> paperRows = new ArrayList<>();
        List<PaperFileEntry> paperFiles = new ArrayList<>();
        Map<UUID, ScoredPaperRow> bestPaperByProject = new LinkedHashMap<>();
        int skippedPapers = 0;
        for (Document doc : inScopePapers) {
            ScoredPaperRow candidate = paperRow(doc);
            if (candidate == null) {
                skippedPapers++;
                continue;
            }
            ScoredPaperRow current = bestPaperByProject.get(doc.getProject().getId());
            if (current == null || candidate.score() > current.score()) {
                if (current != null) skippedPapers++;
                bestPaperByProject.put(doc.getProject().getId(), candidate);
            } else {
                skippedPapers++;
            }
        }
        for (ScoredPaperRow row : bestPaperByProject.values()) {
            paperRows.add(row.values());
            if (row.file() != null) paperFiles.add(row.file());
        }

        List<List<String>> collectionRows = new ArrayList<>();
        int skippedCollections = 0;
        for (Collection collection : collections) {
            User owner = collection.getInstructor();
            if (owner == null || owner.getRole() != UserRole.INSTRUCTOR
                    || !keptEmails.contains(emailOf(owner))) {
                skippedCollections++;
                continue;
            }
            List<String> dois = new ArrayList<>();
            for (var membership : collectionDocumentRepository.findByCollectionId(collection.getId())) {
                Document doc = membership.getDocument();
                if (doc == null || !doc.isActive()) continue;
                String doi = DoiUtils.normalize(doc.getDoi());
                if (doi == null || doi.isBlank()) continue;
                if (projectId != null && (doc.getProject() == null
                        || !projectIds.contains(doc.getProject().getId()))) continue;
                if (!exportedDois.contains(doi.toLowerCase(Locale.ROOT))) continue;
                if (!dois.contains(doi)) dois.add(doi);
            }
            if (dois.isEmpty()) {
                skippedCollections++;
                continue;
            }
            collectionRows.add(List.of(
                    collection.getTitle() == null ? "" : collection.getTitle(),
                    collection.getDescription() == null ? "" : collection.getDescription(),
                    emailOf(owner),
                    String.join("; ", dois)));
        }

        String summary = "Backup bundle exported " + LocalDateTime.now()
                + ": " + userRows.size() + " users, " + projects.size() + " projects, "
                + keptMemberRows.size() + " members, " + sourceRows.size() + " sources, "
                + paperRows.size() + " papers, " + collectionRows.size() + " collections"
                + " (skipped — unrestorable via seed: " + skippedUsers + " users, "
                + skippedMembers + " members, " + skippedSources + " sources, "
                + skippedPapers + " papers, " + skippedCollections + " collections).";
        byte[] xlsx;
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            sheet(wb, "README", List.of("note"), List.of(
                    List.of("Backup bundle — reimport via Data Management seed upload (seed.xlsx at root + papers/<slug>/ files). Targets a fresh database; existing emails/DOIs import as duplicate-skips."),
                    List.of("papers rows: paper_file re-runs extraction; paper_standard regenerates template sections; content_tex imports text without sections."),
                    List.of(summary)));
            sheet(wb, "users", List.of("email", "first_name", "last_name", "role", "student_code", "send_invitation"), userRows);
            sheet(wb, "projects", List.of("project_title", "description", "status", "target_standard"),
                    projects.stream().map(p -> List.of(
                            p.getTitle() == null ? "" : p.getTitle(),
                            p.getDescription() == null ? "" : p.getDescription(),
                            p.getStatus() == null ? "" : p.getStatus().name(),
                            p.getTargetStandard() == null ? "" : p.getTargetStandard().name())).toList());
            sheet(wb, "members", List.of("project_title", "user_email", "project_role"), keptMemberRows);
            sheet(wb, "sources", List.of("project_title", "doi", "title", "authors", "publication_year", "publisher", "cited_by_count", "abstract_or_text"), sourceRows);
            sheet(wb, "papers", List.of("project_title", "paper_folder", "paper_file", "title", "content_tex", "paper_standard"), paperRows);
            sheet(wb, "collections", List.of("collection_title", "description", "owner_email", "source_dois"), collectionRows);
            wb.write(out);
            xlsx = out.toByteArray();
        } catch (IOException e) {
            throw e;
        }
        return new SeedBundle(xlsx, paperFiles, summary);
    }

    private record ScoredPaperRow(List<String> values, PaperFileEntry file, int score) {
    }

    // One paper per project (mirrors the PaperController invariant): file-backed
    // re-extracts with full fidelity, text-only keeps words, stubs last.
    private ScoredPaperRow paperRow(Document doc) {
        String title = doc.getTitle() == null ? "" : doc.getTitle();
        String original = doc.getOriginalFilename() == null ? "" : doc.getOriginalFilename();
        Matcher stub = STANDARD_STUB.matcher(original);
        if ("placeholder".equals(doc.getFileUrl()) || stub.matches()) {
            String standard = stub.matches() ? stub.group(1) : "";
            if (standard.isBlank() && doc.getProject().getTargetStandard() != null) {
                standard = doc.getProject().getTargetStandard().name();
            }
            if (standard.isBlank()) {
                return null;
            }
            return new ScoredPaperRow(
                    List.of(doc.getProject().getTitle(), "", "", title, "", standard), null, 1);
        }
        String objectKey = doc.getFileUrl() == null ? "" : doc.getFileUrl();
        if (!objectKey.isBlank() && documentObjectStorage.exists(objectKey)) {
            String slug = slug(title.isBlank() ? original : title);
            String filename = sanitizeFilename(original.isBlank() ? slug + ".pdf" : original);
            String zipPath = "papers/" + slug + "/" + filename;
            return new ScoredPaperRow(
                    List.of(doc.getProject().getTitle(), slug, zipPath, title, "", ""),
                    new PaperFileEntry(zipPath, objectKey), 3);
        }
        String content = sectionsText(doc);
        if (content == null || content.isBlank()) {
            try {
                var documentText = documentTextRepository.findByDocumentId(doc.getId());
                if (documentText != null) content = documentText.getExtractedText();
            } catch (RuntimeException e) {
                log.warn("Seed export: unreadable text for paper {}", doc.getId());
            }
        }
        if (content == null || content.isBlank()) {
            return null;
        }
        return new ScoredPaperRow(
                List.of(doc.getProject().getTitle(), "", "", title, content, ""), null, 2);
    }

    private String sectionsText(Document doc) {
        try {
            List<PaperSection> sections = paperSectionRepository
                    .findByDocumentIdOrderBySectionOrderAsc(doc.getId());
            List<String> parts = new ArrayList<>();
            for (PaperSection section : sections) {
                if (!section.isActive()) continue;
                String body = section.getContentTex() == null ? "" : section.getContentTex().strip();
                if (body.isBlank()) continue;
                String title = section.getSectionTitle() == null ? "" : section.getSectionTitle().strip();
                parts.add(title.isBlank() ? body : "## " + title + "\n\n" + body);
            }
            return String.join("\n\n", parts);
        } catch (RuntimeException e) {
            log.warn("Seed export: unreadable sections for paper {}", doc.getId());
            return null;
        }
    }

    private static void putUser(Map<String, User> usersByEmail, User user) {
        if (user == null || user.getEmail() == null) return;
        usersByEmail.putIfAbsent(user.getEmail().toLowerCase(Locale.ROOT), user);
    }

    private static String emailOf(User user) {
        return user.getEmail() == null ? "" : user.getEmail().toLowerCase(Locale.ROOT);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String slug(String value) {
        String slug = value == null ? "" : value.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (slug.isBlank()) slug = "untitled";
        return slug.length() > 80 ? slug.substring(0, 80) : slug;
    }

    private static String sanitizeFilename(String name) {
        String base = name.replace("\\", "/");
        int slash = base.lastIndexOf('/');
        base = slash >= 0 ? base.substring(slash + 1) : base;
        base = base.replaceAll("[\\r\\n]+", "").strip();
        return base.isBlank() ? "paper.pdf" : base;
    }

    private static void sheet(Workbook wb, String name, List<String> headers, List<List<String>> rows) {
        Sheet sheet = wb.createSheet(name);
        Row header = sheet.createRow(0);
        for (int i = 0; i < headers.size(); i++) header.createCell(i).setCellValue(headers.get(i));
        for (int r = 0; r < rows.size(); r++) {
            Row row = sheet.createRow(r + 1);
            List<String> values = rows.get(r);
            for (int c = 0; c < values.size(); c++) row.createCell(c).setCellValue(values.get(c));
        }
    }
}
