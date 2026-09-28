package com.evidencepilot.service;

import com.evidencepilot.client.openalex.DoiUtils;
import com.evidencepilot.model.Collection;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.CollectionDocumentRepository;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.DocumentTextRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.ProjectCollectionRepository;
import org.springframework.beans.factory.annotation.Autowired;
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
import java.util.regex.Pattern;

/**
 * Backup-as-seed: exports live rows as a seed-ZIP-layout bundle
 * ({@code seed.xlsx} + {@code papers/<slug>/} files) that re-imports through
 * the existing Data Management seed upload with zero dry-run errors.
 *
 * <p>Only v2-reimportable rows are emitted (active non-Admin users, DOI sources,
 * stored file-backed papers, non-empty owner-scoped collections); everything skipped
 * is tallied into the README sheet. Reimport targets a fresh database —
 * existing emails/DOIs are skipped as duplicates by the importer.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AdminSeedExportService {

    private static final Pattern STANDARD_STUB = Pattern.compile("^_standard_(.+)\\.tex$");

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository memberRepository;
    private final DocumentRepository documentRepository;
    private final DocumentTextRepository documentTextRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final FeedbackRequestRepository feedbackRequestRepository;
    private final CollectionRepository collectionRepository;
    private final CollectionDocumentRepository collectionDocumentRepository;
    private final DocumentObjectStorage documentObjectStorage;

    @Autowired(required = false)
    private ProjectCollectionRepository projectCollectionRepository;

    public record PaperFileEntry(String zipPath, String objectKey) {
    }

    public record SeedBundle(byte[] xlsx, List<PaperFileEntry> paperFiles, String summary) {
    }

    @Transactional(readOnly = true)
    public SeedBundle buildBundle(UUID projectId) throws IOException {
        List<Project> candidates = projectId == null
                ? projectRepository.findAll().stream().filter(Project::isActive).toList()
                : projectRepository.findById(projectId).filter(Project::isActive).map(List::of).orElse(List.of());
        boolean returnedFormat = candidates.stream().anyMatch(project -> project.getStatus() == ProjectStatus.RETURNED)
                && candidates.stream().noneMatch(project -> project.getStatus() == ProjectStatus.SUBMITTED_FOR_REVIEW
                        || project.getStatus() == ProjectStatus.APPROVED || project.getStatus() == ProjectStatus.ARCHIVED);
        List<ProjectMember> allMembers = memberRepository.findAll();
        List<Document> documents = documentRepository.findAll().stream()
                .filter(Document::isActive)
                .toList();
        List<Project> projects = candidates.stream().filter(project -> {
            List<ProjectMember> projectMembers = allMembers.stream()
                    .filter(member -> member.getProject() != null
                            && project.getId().equals(member.getProject().getId()))
                    .toList();
            long instructors = projectMembers.stream().filter(member -> member.getRole() == com.evidencepilot.model.enums.ProjectRole.INSTRUCTOR)
                    .map(ProjectMember::getUser)
                    .filter(user -> user != null && user.getRole() == UserRole.INSTRUCTOR
                            && user.getAccountStatus() == AccountStatus.ACTIVE)
                    .count();
            if (instructors != 1) return false;
            boolean restorableMembers = projectMembers.stream()
                    .allMatch(AdminSeedExportService::isRestorableMember);
            if (!restorableMembers) return false;
            Set<String> memberKeys = new LinkedHashSet<>();
            if (projectMembers.stream().anyMatch(member -> !memberKeys.add(emailOf(member.getUser())))) return false;
            boolean review = project.getStatus() == com.evidencepilot.model.enums.ProjectStatus.SUBMITTED_FOR_REVIEW
                    || project.getStatus() == com.evidencepilot.model.enums.ProjectStatus.APPROVED
                    || project.getStatus() == com.evidencepilot.model.enums.ProjectStatus.ARCHIVED;
            if ((project.getStatus() == ProjectStatus.RETURNED && !returnedFormat)
                    || project.getStatus() == ProjectStatus.PENDING_DELETE) return false;
            if (!review) return true;
            long leaders = projectMembers.stream().filter(member -> member.getRole() == com.evidencepilot.model.enums.ProjectRole.LEADER)
                    .map(ProjectMember::getUser)
                    .filter(user -> user != null && user.getRole() == UserRole.STUDENT
                            && user.getAccountStatus() == AccountStatus.ACTIVE)
                    .count();
            return leaders == 1 && documents.stream()
                    .filter(document -> document.getDocType() == DocumentType.PAPER
                            && document.getProject() != null
                            && project.getId().equals(document.getProject().getId()))
                    .anyMatch(document -> paperRow(document) != null);
        }).toList();
        Map<String, Long> titleCounts = projects.stream().collect(java.util.stream.Collectors.groupingBy(
                project -> project.getTitle() == null ? "" : project.getTitle().toLowerCase(Locale.ROOT),
                LinkedHashMap::new, java.util.stream.Collectors.counting()));
        projects = projects.stream().filter(project -> titleCounts.getOrDefault(
                project.getTitle() == null ? "" : project.getTitle().toLowerCase(Locale.ROOT), 0L) == 1L).toList();
        Set<UUID> projectIds = new LinkedHashSet<>();
        for (Project project : projects) projectIds.add(project.getId());

        List<ProjectMember> members = allMembers.stream()
                .filter(m -> m.getProject() != null && projectIds.contains(m.getProject().getId()))
                .filter(m -> m.getUser() != null)
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
        Set<UUID> linkedCollectionIds = projectId == null || projectCollectionRepository == null
                ? null
                : projectCollectionRepository.findByProjectId(projectId).stream()
                        .map(link -> link.getCollection() == null ? null : link.getCollection().getId())
                        .filter(java.util.Objects::nonNull)
                        .collect(java.util.stream.Collectors.toSet());
        if (linkedCollectionIds != null) {
            collections = collections.stream()
                    .filter(collection -> linkedCollectionIds.contains(collection.getId()))
                    .toList();
        }
        for (Collection collection : collections) {
            if (collection.getInstructor() != null) putUser(usersByEmail, collection.getInstructor());
        }
        for (String email : new ArrayList<>(usersByEmail.keySet())) {
            User user = usersByEmail.get(email);
            if (user.getAccountStatus() != AccountStatus.ACTIVE) {
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
        Set<String> exportedProjectDoiKeys = new java.util.HashSet<>();
        int skippedSources = 0;
        for (Document doc : inScopeSources) {
            String doi = DoiUtils.normalize(doc.getDoi());
            if (doi == null || doi.isBlank() || !DoiUtils.isValid(doi)) {
                skippedSources++;
                continue;
            }
            String projectDoiKey = doc.getProject().getId() + "\0" + doi.toLowerCase(Locale.ROOT);
            if (!exportedProjectDoiKeys.add(projectDoiKey)) {
                skippedSources++;
                continue;
            }
            sourceRows.add(List.of(doc.getProject().getTitle(), doi));
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
        List<List<String>> projectCollectionRows = new ArrayList<>();
        int skippedCollections = 0;
        Set<String> exportedCollectionTitles = new java.util.HashSet<>();
        Map<UUID, String> instructorByProject = new LinkedHashMap<>();
        for (ProjectMember member : members) {
            if (member.getRole() == ProjectRole.INSTRUCTOR
                    && isRestorableMember(member)
                    && member.getUser() != null) {
                instructorByProject.put(member.getProject().getId(), emailOf(member.getUser()));
            }
        }
        Map<UUID, String> exportedCollectionTitlesById = new LinkedHashMap<>();
        for (Collection collection : collections) {
            User owner = collection.getInstructor();
            String collectionTitle = collection.getTitle() == null ? "" : collection.getTitle().trim();
            if (collectionTitle.isBlank()
                    || owner == null || owner.getRole() != UserRole.INSTRUCTOR
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
                if (doc.getProject() == null || !projectIds.contains(doc.getProject().getId())) continue;
                if (!emailOf(owner).equals(instructorByProject.get(doc.getProject().getId()))) continue;
                if (!exportedDois.contains(doi.toLowerCase(Locale.ROOT))) continue;
                if (!dois.contains(doi)) dois.add(doi);
            }
            boolean ambiguous = dois.stream().anyMatch(doi -> inScopeSources.stream()
                    .filter(source -> source.getProject() != null
                            && emailOf(owner).equals(instructorByProject.get(source.getProject().getId()))
                            && doi.equalsIgnoreCase(DoiUtils.normalize(source.getDoi())))
                    .count() != 1);
            if (dois.isEmpty() || ambiguous) {
                skippedCollections++;
                continue;
            }
            if (!exportedCollectionTitles.add(collectionTitle)) {
                skippedCollections++;
                continue;
            }
            exportedCollectionTitlesById.put(collection.getId(), collectionTitle);
            collectionRows.add(List.of(
                    collectionTitle,
                    collection.getDescription() == null ? "" : collection.getDescription(),
                    emailOf(owner),
                    String.join("; ", dois)));
        }

        if (!returnedFormat && projectCollectionRepository != null) {
            for (var link : projectCollectionRepository.findAll()) {
                if (link.getProject() == null || link.getCollection() == null
                        || !projectIds.contains(link.getProject().getId())
                        || (projectId != null && !projectId.equals(link.getProject().getId()))
                        || !link.getCollection().isActive()) continue;
                String collectionTitle = exportedCollectionTitlesById.get(link.getCollection().getId());
                if (collectionTitle == null) continue;
                projectCollectionRows.add(List.of(link.getProject().getTitle(), collectionTitle));
            }
        }

        // Sections + returned-review requests: emitted in import format (titles and
        // content, never IDs) so a reimport rebuilds live rows and a fresh snapshot
        // instead of carrying stale foreign keys.
        List<List<String>> sectionRows = new ArrayList<>();
        int skippedSections = 0;
        for (Document paper : inScopePapers) {
            if (!returnedFormat || paper.getProject() == null
                    || paper.getProject().getStatus() != ProjectStatus.RETURNED) continue;
            List<PaperSection> paperSections;
            try {
                paperSections = paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId());
            } catch (RuntimeException e) {
                log.warn("Seed export: unreadable sections for paper {}", paper.getId());
                continue;
            }
            for (PaperSection section : paperSections) {
                if (section == null || !section.isActive()) continue;
                String title = nullToEmpty(section.getSectionTitle());
                String content = nullToEmpty(section.getContentTex());
                if (title.isBlank() || content.isBlank()) {
                    skippedSections++;
                    continue;
                }
                if (content.length() > 32767) content = content.substring(0, 32767);
                User assignee = section.getAssignedUser();
                sectionRows.add(List.of(
                        paper.getProject().getTitle(),
                        title,
                        String.valueOf(section.getSectionOrder()),
                        content,
                        assignee == null || assignee.getEmail() == null ? "" : assignee.getEmail().toLowerCase(Locale.ROOT)));
            }
        }

        List<List<String>> feedbackRows = new ArrayList<>();
        int skippedFeedbackRequests = 0;
        for (Project project : projects) {
            if (!returnedFormat || project.getStatus() != ProjectStatus.RETURNED) continue;
            FeedbackRequest returned;
            try {
                returned = feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId()).stream()
                        .filter(request -> request.getStatus() == FeedbackStatus.RETURNED)
                        .findFirst().orElse(null);
            } catch (RuntimeException e) {
                log.warn("Seed export: unreadable feedback requests for project {}", project.getId());
                continue;
            }
            if (returned == null
                    || returned.getInstructor() == null || returned.getInstructor().getEmail() == null
                    || !keptEmails.contains(returned.getInstructor().getEmail().toLowerCase(Locale.ROOT))
                    || returned.getStudent() == null || returned.getStudent().getEmail() == null
                    || !keptEmails.contains(returned.getStudent().getEmail().toLowerCase(Locale.ROOT))) {
                skippedFeedbackRequests++;
                continue;
            }
            feedbackRows.add(List.of(
                    project.getTitle(),
                    returned.getInstructor().getEmail().toLowerCase(Locale.ROOT),
                    returned.getStudent().getEmail().toLowerCase(Locale.ROOT),
                    returned.getRequestedAt() == null ? "" : returned.getRequestedAt().toString(),
                    returned.getReturnedAt() == null ? "" : returned.getReturnedAt().toString()));
        }

        validateExportCaps(userRows, projects, keptMemberRows, sourceRows, paperRows,
                collectionRows, returnedFormat ? sectionRows : projectCollectionRows);
        if (feedbackRows.size() > 200) throw new IllegalStateException("seed export exceeds the 200-row sheet limit");

        String summary = "Backup bundle exported " + LocalDateTime.now()
                + ": " + userRows.size() + " users, " + projects.size() + " projects, "
                + keptMemberRows.size() + " members, " + sourceRows.size() + " sources, "
                + paperRows.size() + " papers, " + collectionRows.size() + " collections, "
                + sectionRows.size() + " sections, " + feedbackRows.size() + " feedback_requests"
                + " (skipped — unrestorable via seed: " + skippedUsers + " users, "
                + (candidates.size() - projects.size()) + " projects, "
                + skippedMembers + " members, " + skippedSources + " sources, "
                + skippedPapers + " papers, " + skippedCollections + " collections, "
                + skippedSections + " sections, " + skippedFeedbackRequests + " feedback_requests).";
        byte[] xlsx;
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            List<List<String>> readme = new ArrayList<>();
            if (!returnedFormat) readme.add(List.of("seed_format_version", "2"));
            readme.add(List.of("bundle", "Backup bundle — seed.xlsx at root + papers/<slug>/ files."));
            readme.add(List.of("papers", "Only stored PDF/DOCX/TEX papers are exported; standard/text-only papers are skipped."));
            readme.add(List.of("summary", summary));
            sheet(wb, "README", List.of("key", "value"), readme);
            sheet(wb, "users", List.of("email", "first_name", "last_name", "role", "student_code", "send_invitation"), userRows);
            sheet(wb, "projects", List.of("project_title", "description", "status", "target_standard"),
                    projects.stream().map(p -> List.of(
                            p.getTitle() == null ? "" : p.getTitle(),
                            p.getDescription() == null ? "" : p.getDescription(),
                            p.getStatus() == null ? "" : p.getStatus().name(),
                            p.getTargetStandard() == null ? "" : p.getTargetStandard().name())).toList());
            sheet(wb, "members", List.of("project_title", "user_email", "project_role"), keptMemberRows);
            sheet(wb, "sources", List.of("project_title", "doi"), sourceRows);
            sheet(wb, "papers", List.of("project_title", "paper_file"), paperRows);
            sheet(wb, "collections", List.of("collection_title", "description", "owner_email", "source_dois"), collectionRows);
            if (returnedFormat) {
                sheet(wb, "sections", List.of("project_title", "section_title", "section_order", "content_tex", "assigned_user_email"), sectionRows);
                sheet(wb, "feedback_requests", List.of("project_title", "reviewer_email", "student_email", "requested_at", "returned_at"), feedbackRows);
            } else {
                sheet(wb, "project_collections", List.of("project_title", "collection_title"), projectCollectionRows);
            }
            wb.write(out);
            xlsx = out.toByteArray();
        } catch (IOException e) {
            throw e;
        }
        return new SeedBundle(xlsx, paperFiles, summary);
    }

    private static void validateExportCaps(List<List<String>> users, List<Project> projects,
                                           List<List<String>> members, List<List<String>> sources,
                                           List<List<String>> papers, List<List<String>> collections,
                                           List<List<String>> extraRows) {
        if (users.size() > 200 || projects.size() > 200 || sources.size() > 200
                || papers.size() > 200 || collections.size() > 200 || extraRows.size() > 200) {
            throw new IllegalStateException("seed export exceeds the 200-row sheet limit");
        }
        if (members.size() > 500) throw new IllegalStateException("seed export exceeds the 500-row members limit");
    }

    private record ScoredPaperRow(List<String> values, PaperFileEntry file, int score) {
    }

    private static boolean isRestorableMember(ProjectMember member) {
        if (member == null || member.getUser() == null || member.getRole() == null) return false;
        User user = member.getUser();
        if (user.getRole() == UserRole.ADMIN || user.getAccountStatus() != AccountStatus.ACTIVE) return false;
        if (user.getRole() == UserRole.STUDENT) {
            return (member.getRole() == ProjectRole.LEADER || member.getRole() == ProjectRole.MEMBER)
                    && user.getStudentCode() != null
                    && user.getStudentCode().trim().toUpperCase(Locale.ROOT).matches("^[A-Z]{2}\\d{6}$");
        }
        return user.getRole() == UserRole.INSTRUCTOR && member.getRole() == ProjectRole.INSTRUCTOR;
    }

    // One file-backed paper per project. v2 deliberately drops text-only and
    // standard stubs because the handoff contract is paper-file only.
    private ScoredPaperRow paperRow(Document doc) {
        String original = doc.getOriginalFilename() == null ? "" : doc.getOriginalFilename();
        if ("placeholder".equals(doc.getFileUrl()) || STANDARD_STUB.matcher(original).matches()) return null;
        String objectKey = doc.getFileUrl() == null ? "" : doc.getFileUrl();
        if (!objectKey.isBlank() && documentObjectStorage.exists(objectKey)) {
            String slug = slug(doc.getProject().getTitle());
            String suffix = doc.getId().toString().substring(0, 8);
            slug = slug.length() > 71 ? slug.substring(0, 71) : slug;
            slug = slug + "-" + suffix;
            String filename = sanitizeFilename(original.isBlank() ? slug + ".pdf" : original);
            if (!filename.toLowerCase(Locale.ROOT).matches(".+\\.(pdf|docx|tex)")) return null;
            String zipPath = "papers/" + slug + "/" + slug
                    + filename.substring(filename.lastIndexOf('.')).toLowerCase(Locale.ROOT);
            return new ScoredPaperRow(
                    List.of(doc.getProject().getTitle(), zipPath),
                    new PaperFileEntry(zipPath, objectKey), 3);
        }
        return null;
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
