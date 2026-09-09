package com.evidencepilot.service;

import com.evidencepilot.dto.request.AdminUserImportRequest;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentText;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentChunkRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.DocumentTextRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BiConsumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Excel + folder-per-paper ZIP seed. Streaming-light: caps enforced
 * (6 sheets, 200 rows/sheet, 10MB xlsx). ZIP bundles are uncapped and
 * spooled entry-by-entry to temp files (never heap) with per-job cleanup.
 * Reuses AdminService user validation, DocumentService extraction pipeline,
 * MediaAssetService for images. Async jobs with in-memory progress (pollable).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminExcelSeedService {

    private static final int MAX_ROWS_PER_SHEET = 200;
    private static final long MAX_XLSX_BYTES = 10L * 1024 * 1024;
    private static final List<String> SHEETS = List.of("users", "projects", "members", "sources", "papers", "sections");
    private static final Set<String> INVITE_TRUE_TOKENS = Set.of("TRUE", "1", "YES", "Y");
    private static final Set<String> INVITE_FALSE_TOKENS = Set.of("FALSE", "0", "NO", "N");

    /**
     * Blank means FALSE (silent ACTIVE account) — sending mail is explicit opt-in.
     */
    public static boolean sendInvitationRequested(String raw) {
        return raw != null && INVITE_TRUE_TOKENS.contains(raw.trim().toUpperCase(Locale.ROOT));
    }

    static boolean isInviteTokenValid(String raw) {
        if (raw == null || raw.isBlank()) return true;
        String token = raw.trim().toUpperCase(Locale.ROOT);
        return INVITE_TRUE_TOKENS.contains(token) || INVITE_FALSE_TOKENS.contains(token);
    }

    private final AdminService adminService;
    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository memberRepository;
    private final DocumentRepository documentRepository;
    private final DocumentTextRepository documentTextRepository;
    private final DocumentChunkRepository documentChunkRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final DocumentService documentService;
    private final MediaAssetService mediaAssetService;
    private final PaperProcessingService paperProcessingService;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<UUID, SeedJob> jobs = new ConcurrentHashMap<>();

    @Getter
    public static class SeedJob {
        private final UUID id = UUID.randomUUID();
        private volatile String status = "QUEUED"; // QUEUED|RUNNING|DONE|FAILED
        private volatile int total;
        private volatile int processed;
        private volatile String currentStep = "";
        private final List<String> errors = new ArrayList<>();
        private volatile Map<String, Integer> result = Map.of();
    }

    public record ParsedSeed(Map<String, List<Map<String, String>>> sheets, List<String> errors) {}
    public record ZipBundle(Map<String, Path> files, List<String> errors, Path spoolDir) {
        public ZipBundle(Map<String, Path> files, List<String> errors) {
            this(files, errors, null);
        }
    }

    // ---------- template ----------

    public byte[] buildTemplate() throws IOException {
        try (Workbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            sheet(wb, "README", List.of("note"),
                    List.of(
                            List.of("Bundle = seed.xlsx + papers/<slug>/ folders only. Fill users→projects→members→sources→papers→sections. Reference by email/project_title."),
                            List.of("papers.paper_folder must equal the <slug> in papers.paper_file (^[a-z0-9-]{1,80}$). Main file must be named <slug>.pdf|.docx|.tex after its folder; images/ goes beside it."),
                            List.of("Precedence: paper_file, then paper_standard, then content_tex. Max 1 paper per project. xlsx<=10MB, zip size uncapped (spooled to disk), 200 rows/sheet."),
                            List.of("paper_standard (IEEE|ACM|...) creates a standard-template paper like Instructor Page choose-standard: leave paper_file and content_tex blank, sections are generated."),
                            List.of("users.send_invitation: TRUE sends the set-password email; FALSE or blank creates an ACTIVE account with password EP123456! and sends nothing.")));
            sheet(wb, "users", List.of("email", "first_name", "last_name", "role", "student_code", "send_invitation"),
                    List.of(List.of("demo01@example.test", "An", "Nguyen", "STUDENT", "AB123456", "FALSE"),
                            List.of("prof@example.test", "Binh", "Tran", "INSTRUCTOR", "", "TRUE")));
            sheet(wb, "projects", List.of("project_title", "description", "status", "target_standard"),
                    List.of(List.of("EP-DEMO-Retrieval", "Demo project", "IN_PROGRESS", "CUSTOM")));
            sheet(wb, "members", List.of("project_title", "user_email", "project_role"),
                    List.of(List.of("EP-DEMO-Retrieval", "demo01@example.test", "LEADER"),
                            List.of("EP-DEMO-Retrieval", "prof@example.test", "INSTRUCTOR")));
            sheet(wb, "sources", List.of("project_title", "doi", "title", "authors", "publication_year", "publisher", "cited_by_count", "abstract_or_text"),
                    List.of(List.of("EP-DEMO-Retrieval", "10.1234/demo.smith2023", "Hybrid retrieval", "Smith, A.", "2023", "Demo Press", "42", "Smith et al. report 89.2% accuracy.")));
            sheet(wb, "papers", List.of("project_title", "paper_folder", "paper_file", "title", "content_tex", "paper_standard"),
                    List.of(List.of("EP-DEMO-Retrieval", "attention-retrieval", "papers/attention-retrieval/attention-retrieval.tex", "Attention demo", "", "")));
            sheet(wb, "sections", List.of("project_title", "section_title", "section_order", "content_tex", "assigned_user_email"),
                    List.of(List.of("EP-DEMO-Retrieval", "Introduction", "0", "Transformer models are widely used.", "demo01@example.test")));
            wb.write(out);
            return out.toByteArray();
        }
    }

    /**
     * Bundle template: seed.xlsx + example papers/&lt;slug&gt;/ folder with a
     * sample paper.tex, a per-folder README.md manual, and an images/ placeholder.
     */
    public byte[] buildTemplateBundle() throws IOException {
        byte[] xlsx = buildTemplate();
        // ponytail: .tex example — passes PAPER validation and takes the latex
        // fast-path extraction (no model call), unlike .txt which is rejected
        String paper = "\\section{Introduction}\n"
                + "Our method improves recall by 34\\% over prior work.\n\n"
                + "\\section{Results}\n"
                + "Smith et al. report 89.2\\% accuracy on citation matching.\n";
        String imgReadme = "Put figures for this paper here (png/jpg/jpeg/gif/pdf).\n"
                + "Reference from .tex as images/<name>.\n"
                + "You may delete this README once you've added figures — it is never uploaded as media.\n";
        // ponytail: instructions-only file — sits directly in the paper folder (not
        // images/), so validation ignores it and it is never imported
        String folderGuide = "# How to add a paper to this folder (manual)\n"
                + "\n"
                + "This folder feeds one `papers` row in seed.xlsx and becomes the project's paper,\n"
                + "extracted exactly like an Instructor upload (sections auto-detected).\n"
                + "\n"
                + "## 1. Folder name\n"
                + "\n"
                + "- Must match `paper_folder` in seed.xlsx and satisfy `^[a-z0-9-]{1,80}$`\n"
                + "  (lowercase, digits, hyphens), e.g. `attention-retrieval`.\n"
                + "- `paper_file` must then read `papers/<same-slug>/<same-slug>.{pdf,docx,tex}`\n"
                + "  (e.g. `papers/attention-retrieval/attention-retrieval.pdf`).\n"
                + "\n"
                + "## 2. Download the paper (OpenAlex)\n"
                + "\n"
                + "1. Find the work: `https://api.openalex.org/works/https://doi.org/<DOI>`\n"
                + "   (or search `https://openalex.org/works?search=<title>`).\n"
                + "2. Open `primary_location.pdf_url` (fallback `best_oa_location.pdf_url`) and save it\n"
                + "   here as `<folder-name>.pdf` (same name as this folder). `.docx`/`.tex` are\n"
                + "   also accepted; `.txt` is rejected.\n"
                + "3. Copy the work's title/authors/year/publisher/cited_by_count into the matching\n"
                + "   `sources` row so the seed mirrors OpenAlex metadata.\n"
                + "\n"
                + "## 3. Figures (optional)\n"
                + "\n"
                + "- Put them flat under `images/` (png/jpg/jpeg/gif/pdf, max 10MB each).\n"
                + "- Reference from `.tex` as `images/<name>`. `images/README.txt` is only a\n"
                + "  placeholder — delete it or leave it, it is never uploaded.\n"
                + "- This README.md is instructions only: it is ignored by validation and never imported.\n"
                + "\n"
                + "## 4. Wire up seed.xlsx\n"
                + "\n"
                + "- `papers` row: `paper_folder` = this folder's name, `paper_file` = its path,\n"
                + "  leave `content_tex` empty (file wins). Max 1 paper row per project.\n"
                + "- Prefer `.tex` for instant sections (latex fast-path, no model call);\n"
                + "  `.pdf`/`.docx` go through full extraction and appear as QUEUED, then READY.\n"
                + "\n"
                + "## 5. Upload\n"
                + "\n"
                + "Re-zip as `seed.xlsx` at root + `papers/...`, upload the `.zip` in Data Management\n"
                + "-> Insert Data. Preview first for `.xlsx`-only bundles; watch the progress bar.\n";
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
                java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(out, StandardCharsets.UTF_8)) {
            zip.putNextEntry(new java.util.zip.ZipEntry("seed.xlsx"));
            zip.write(xlsx);
            zip.closeEntry();
            zip.putNextEntry(new java.util.zip.ZipEntry("papers/attention-retrieval/attention-retrieval.tex"));
            zip.write(paper.getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new java.util.zip.ZipEntry("papers/attention-retrieval/README.md"));
            zip.write(folderGuide.getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new java.util.zip.ZipEntry("papers/attention-retrieval/images/README.txt"));
            zip.write(imgReadme.getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.finish();
            return out.toByteArray();
        }
    }

    private static void sheet(Workbook wb, String name, List<String> headers, List<List<String>> rows) {
        Sheet s = wb.createSheet(name);
        Row h = s.createRow(0);
        for (int i = 0; i < headers.size(); i++) h.createCell(i).setCellValue(headers.get(i));
        for (int r = 0; r < rows.size(); r++) {
            Row row = s.createRow(r + 1);
            List<String> vals = rows.get(r);
            for (int c = 0; c < vals.size(); c++) row.createCell(c).setCellValue(vals.get(c));
        }
    }

    // ---------- parse ----------

    public ParsedSeed parse(InputStream in, long size) throws IOException {
        List<String> errors = new ArrayList<>();
        if (size > MAX_XLSX_BYTES) {
            errors.add("xlsx exceeds 10MB limit");
            return new ParsedSeed(Map.of(), errors);
        }
        Map<String, List<Map<String, String>>> sheets = new LinkedHashMap<>();
        try (Workbook wb = new XSSFWorkbook(in)) {
            if (wb.getNumberOfSheets() > 7) errors.add("too many sheets (max README + 6 data sheets)");
            for (String name : SHEETS) {
                Sheet s = wb.getSheet(name);
                if (s == null) continue;
                List<String> headers = new ArrayList<>();
                Row hr = s.getRow(0);
                if (hr == null) {
                    errors.add(name + ": missing header row");
                    continue;
                }
                hr.forEach(c -> headers.add(str(c).trim().toLowerCase(Locale.ROOT)));
                List<Map<String, String>> rows = new ArrayList<>();
                for (int r = 1; r <= s.getLastRowNum(); r++) {
                    Row row = s.getRow(r);
                    if (row == null || isBlankRow(row, headers.size())) continue;
                    if (rows.size() >= MAX_ROWS_PER_SHEET) {
                        errors.add(name + ": exceeds 200 rows");
                        break;
                    }
                    Map<String, String> m = new LinkedHashMap<>();
                    for (int c = 0; c < headers.size(); c++) m.put(headers.get(c), str(row.getCell(c)).trim());
                    m.put("_row", String.valueOf(r + 1));
                    rows.add(m);
                }
                sheets.put(name, rows);
            }
        }
        errors.addAll(validate(sheets));
        return new ParsedSeed(sheets, errors);
    }

    /**
     * Reads a seed bundle with no size cap — entries stream straight to temp
     * files so arbitrarily large bundles never sit in heap. Callers must let
     * the seed job delete {@link ZipBundle#spoolDir} when done.
     */
    public ZipBundle readZip(InputStream in) throws IOException {
        List<String> errors = new ArrayList<>();
        Path spoolDir = Files.createTempDirectory("seed-zip-");
        try {
            Map<String, Path> files = new LinkedHashMap<>();
            try (ZipInputStream zip = new ZipInputStream(in, StandardCharsets.UTF_8)) {
                ZipEntry e;
                while ((e = zip.getNextEntry()) != null) {
                    String name = e.getName();
                    if (e.isDirectory()) continue;
                    if (name.contains("..") || name.startsWith("/") || name.startsWith("\\")) {
                        errors.add("zip: illegal path " + name);
                        continue;
                    }
                    Path target = spoolDir.resolve(name.replace("/", java.io.File.separator));
                    Files.createDirectories(target.getParent());
                    Files.copy(zip, target, StandardCopyOption.REPLACE_EXISTING);
                    files.put(name, target);
                }
            }
            return new ZipBundle(files, errors, spoolDir);
        } catch (IOException | RuntimeException failure) {
            deleteSpoolDir(spoolDir);
            throw failure;
        }
    }

    public static void deleteSpoolDir(Path spoolDir) {
        if (spoolDir == null) return;
        try (var walk = Files.walk(spoolDir)) {
            walk.sorted(java.util.Comparator.reverseOrder())
                    .forEach(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (IOException ignored) {
                            // best effort — OS temp cleaners reclaim leftovers
                        }
                    });
        } catch (IOException ignored) {
            // best effort — OS temp cleaners reclaim leftovers
        }
    }

    // ---------- validate (dry-run, no writes) ----------

    List<String> validate(Map<String, List<Map<String, String>>> sheets) {
        List<String> errors = new ArrayList<>();
        // users: reuse AdminService patterns lightly (email/code/role)
        var emails = new java.util.HashSet<String>();
        for (var r : sheets.getOrDefault("users", List.of())) {
            String at = "users row " + r.get("_row") + ": ";
            String email = r.getOrDefault("email", "").toLowerCase(Locale.ROOT);
            if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) errors.add(at + "invalid email");
            else if (!emails.add(email)) errors.add(at + "duplicate email in file");
            String role = r.getOrDefault("role", "").toUpperCase(Locale.ROOT);
            if (!role.equals("STUDENT") && !role.equals("INSTRUCTOR")) errors.add(at + "role must be STUDENT or INSTRUCTOR");
            String code = r.getOrDefault("student_code", "").toUpperCase(Locale.ROOT);
            if (role.equals("STUDENT") && !code.matches("^[A-Z]{2}\\d{6}$")) errors.add(at + "student_code must match AB123456");
            if (role.equals("INSTRUCTOR") && !code.isBlank()) errors.add(at + "INSTRUCTOR must omit student_code");
            if (!isInviteTokenValid(r.getOrDefault("send_invitation", ""))) {
                errors.add(at + "send_invitation must be TRUE or FALSE (blank means FALSE)");
            }
        }
        var titles = new java.util.HashSet<String>();
        for (var r : sheets.getOrDefault("projects", List.of())) {
            String at = "projects row " + r.get("_row") + ": ";
            if (r.getOrDefault("project_title", "").isBlank()) errors.add(at + "project_title required");
            else if (!titles.add(r.get("project_title"))) errors.add(at + "duplicate project_title");
            String st = r.getOrDefault("status", "CREATED");
            if (!st.isBlank()) try {
                ProjectStatus v = ProjectStatus.valueOf(st);
                if (v.isReadOnly()) errors.add(at + "read-only status not allowed on seed: " + st);
            } catch (IllegalArgumentException ex) {
                errors.add(at + "unknown status: " + st);
            }
            String std = r.getOrDefault("target_standard", "");
            if (!std.isBlank()) try {
                PaperStandard.valueOf(std);
            } catch (IllegalArgumentException ex) {
                errors.add(at + "unknown target_standard: " + std);
            }
        }
        for (var r : sheets.getOrDefault("members", List.of())) {
            String at = "members row " + r.get("_row") + ": ";
            if (!titles.contains(r.getOrDefault("project_title", ""))) errors.add(at + "unknown project_title");
            try {
                ProjectRole.valueOf(r.getOrDefault("project_role", ""));
            } catch (IllegalArgumentException ex) {
                errors.add(at + "project_role must be LEADER|MEMBER|INSTRUCTOR");
            }
        }
        for (var r : sheets.getOrDefault("papers", List.of())) {
            String at = "papers row " + r.get("_row") + ": ";
            if (!titles.contains(r.getOrDefault("project_title", ""))) errors.add(at + "unknown project_title");
            String folder = r.getOrDefault("paper_folder", "");
            if (!folder.isBlank() && !folder.matches("^[a-z0-9-]{1,80}$")) errors.add(at + "paper_folder must match ^[a-z0-9-]{1,80}$");
            String paperFile = r.getOrDefault("paper_file", "").replace("\\", "/").replaceAll("^/+", "");
            if (!folder.isBlank() && paperFile.startsWith("papers/")) {
                String[] seg = paperFile.split("/");
                if (seg.length == 3 && !seg[1].equals(folder)) {
                    errors.add(at + "paper_folder must equal the folder in paper_file (papers/" + folder + "/…)");
                }
            }
            boolean hasFile = !r.getOrDefault("paper_file", "").isBlank();
            boolean hasText = !r.getOrDefault("content_tex", "").isBlank();
            String standardRaw = r.getOrDefault("paper_standard", "").trim();
            boolean hasStandard = false;
            if (!standardRaw.isBlank()) {
                try {
                    PaperStandard.valueOf(standardRaw.toUpperCase(Locale.ROOT));
                    hasStandard = true;
                } catch (IllegalArgumentException ex) {
                    errors.add(at + "unknown paper_standard: " + standardRaw);
                }
            }
            if (!hasFile && !hasText && !hasStandard && standardRaw.isBlank()) {
                errors.add(at + "need paper_file, content_tex, or paper_standard");
            }
        }
        // one paper per project
        var paperCount = new java.util.HashMap<String, Integer>();
        for (var r : sheets.getOrDefault("papers", List.of())) {
            paperCount.merge(r.getOrDefault("project_title", ""), 1, Integer::sum);
        }
        paperCount.forEach((t, n) -> {
            if (n > 1) errors.add("papers: project '" + t + "' has " + n + " rows (max 1, mirrors PaperController one-paper rule)");
        });
        return errors;
    }

    // ---------- async jobs ----------

    public SeedJob submit(byte[] xlsx, ZipBundle bundle, BiConsumer<SeedJob, String> log) {
        SeedJob job = new SeedJob();
        job.total = 1;
        jobs.put(job.getId(), job);
        // ponytail: worker thread has no SecurityContext — capture the requesting
        // ADMIN auth so uploadDocument/media/importUsers don't 401 (ADMIN bypasses
        // project write checks in CurrentUserServiceImpl).
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        ZipBundle safe = bundle == null ? new ZipBundle(Map.of(), List.of()) : bundle;
        executor.submit(() -> runJob(job, xlsx, safe, auth));
        return job;
    }

    public SeedJob get(UUID id) {
        return jobs.get(id);
    }

    private void runJob(SeedJob job, byte[] xlsx, ZipBundle bundle, Authentication auth) {
        job.status = "RUNNING";
        var context = SecurityContextHolder.getContext();
        Authentication previous = context.getAuthentication();
        context.setAuthentication(auth);
        try {
            ParsedSeed parsed;
            try (InputStream in = new ByteArrayInputStream(xlsx)) {
                parsed = parse(in, xlsx.length);
            }
            if (!parsed.errors().isEmpty()) {
                job.errors.addAll(parsed.errors());
                job.status = "FAILED";
                return;
            }
            // zip layout check for folder-per-paper rows
            List<String> zipErrors = checkZipLayout(parsed.sheets(), bundle.files());
            if (!zipErrors.isEmpty()) {
                job.errors.addAll(zipErrors);
                job.status = "FAILED";
                return;
            }
            int total = parsed.sheets().values().stream().mapToInt(List::size).sum();
            job.total = Math.max(total, 1);
            Map<String, Integer> counts = new LinkedHashMap<>();
            var userRows = parsed.sheets().getOrDefault("users", List.of());
            long invited = userRows.stream()
                    .filter(r -> sendInvitationRequested(r.getOrDefault("send_invitation", "")))
                    .count();
            counts.put("users", commitUsers(userRows, job));
            counts.put("users_invited", (int) invited);
            counts.put("users_silent", userRows.size() - (int) invited);
            counts.put("projects", commitProjects(parsed.sheets().getOrDefault("projects", List.of()), job));
            counts.put("members", commitMembers(parsed.sheets().getOrDefault("members", List.of()), job));
            counts.put("sources", commitSources(parsed.sheets().getOrDefault("sources", List.of()), job));
            counts.put("papers", commitPapers(parsed.sheets().getOrDefault("papers", List.of()), bundle.files(), job));
            counts.put("sections", commitSections(parsed.sheets().getOrDefault("sections", List.of()), job));
            job.result = counts;
            job.status = job.errors.isEmpty() ? "DONE" : "DONE";
        } catch (Exception e) {
            log.error("Seed job {} failed", job.getId(), e);
            job.errors.add(e.getMessage() == null ? e.toString() : e.getMessage());
            job.status = "FAILED";
        } finally {
            context.setAuthentication(previous);
            deleteSpoolDir(bundle.spoolDir());
        }
    }

    List<String> checkZipLayout(Map<String, List<Map<String, String>>> sheets, Map<String, Path> zipFiles) {
        List<String> errors = new ArrayList<>();
        for (var r : sheets.getOrDefault("papers", List.of())) {
            String pf = r.getOrDefault("paper_file", "");
            if (pf.isBlank()) continue;
            String norm = pf.replace("\\", "/").replaceAll("^/+", "");
            // accept papers/<slug>/<slug>.* or files/** (legacy flat)
            if (norm.startsWith("papers/")) {
                String[] parts = norm.split("/");
                if (parts.length != 3 || !parts[1].matches("^[a-z0-9-]{1,80}$")) {
                    errors.add("papers row " + r.get("_row") + ": paper_file must be papers/<slug>/<slug>.{pdf,docx,tex}");
                    continue;
                }
                String expected = parts[1] + ".";
                String fname = parts[2].toLowerCase(Locale.ROOT);
                if (!fname.startsWith(expected) || !fname.matches(".+\\.(pdf|docx|tex)")) {
                    // ponytail: same wording as DocumentServiceImpl.validateFile (415 path)
                    if (fname.matches(".+\\.(pdf|docx|tex|txt|md|markdown|doc)")) {
                        errors.add("papers row " + r.get("_row")
                                + ": folder main file must be named " + parts[1] + ".{pdf,docx,tex} after its folder"
                                + " (e.g. papers/" + parts[1] + "/" + parts[1] + ".pdf)");
                    } else {
                        errors.add("papers row " + r.get("_row")
                                + ": Only PDF, DOCX, and LaTeX (.tex) files are supported for papers");
                    }
                }
                if (!zipFiles.containsKey(norm) && !zipFiles.containsKey(parts[0] + "/" + parts[1] + "/" + parts[2])) {
                    // ponytail: tailored guidance — HOW-TO-ADD-only (paywalled) and
                    // missing/empty folders get actionable messages instead of a bare path
                    String prefix = parts[0] + "/" + parts[1] + "/";
                    boolean hasHowTo = zipFiles.keySet().stream()
                            .anyMatch(k -> k.startsWith(prefix)
                                    && k.substring(k.lastIndexOf('/') + 1).equalsIgnoreCase("HOW-TO-ADD.txt"));
                    boolean hasAny = zipFiles.keySet().stream().anyMatch(k -> k.startsWith(prefix));
                    String want = parts[1] + ".{pdf,docx,tex}";
                    if (hasHowTo) {
                        errors.add("papers row " + r.get("_row")
                                + ": " + want + " missing and folder holds only HOW-TO-ADD.txt (paywalled source)"
                                + " — add the file or remove this papers row + its sections rows");
                    } else if (!hasAny) {
                        errors.add("papers row " + r.get("_row") + ": folder " + prefix
                                + " is missing or empty in the ZIP"
                                + " — add " + want + " or remove this papers row + its sections rows");
                    } else {
                        errors.add("papers row " + r.get("_row") + ": missing in ZIP: " + norm);
                    }
                }
            } else if (!zipFiles.containsKey(norm)) {
                errors.add("papers row " + r.get("_row") + ": missing in ZIP: " + norm);
            }
        }
        // images/ folders: README.txt is the template placeholder (never uploaded);
        // anything else must be an image, otherwise it is rejected here at preview
        for (String name : zipFiles.keySet()) {
            String norm = name.replace("\\", "/");
            int marker = norm.indexOf("/images/");
            if (marker < 0) continue;
            String base = norm.substring(norm.lastIndexOf('/') + 1);
            if (base.equalsIgnoreCase("README.txt")) continue;
            if (!base.toLowerCase(Locale.ROOT).matches(".+\\.(png|jpe?g|gif|pdf)")) {
                errors.add("ZIP " + name + ": only png/jpg/jpeg/gif/pdf allowed under images/ (delete it or rename)");
            }
        }
        return errors;
    }

    static boolean isImageEntry(String name) {
        String base = name.substring(name.lastIndexOf('/') + 1);
        if (base.equalsIgnoreCase("README.txt")) return false;
        return base.toLowerCase(Locale.ROOT).matches(".+\\.(png|jpe?g|gif|pdf)");
    }

    // ---------- commit (FK order) ----------

    @Transactional
    public int commitUsers(List<Map<String, String>> rows, SeedJob job) {
        if (rows.isEmpty()) return 0;
        // group by role (importUsers takes one role per call) and by invitation
        // flag — send_invitation=FALSE rows become silent ACTIVE accounts
        record UserGroup(String role, boolean invite) {}
        Map<UserGroup, List<Map<String, String>>> groups = new LinkedHashMap<>();
        for (var r : rows) {
            var key = new UserGroup(
                    r.getOrDefault("role", "STUDENT").toUpperCase(Locale.ROOT),
                    sendInvitationRequested(r.getOrDefault("send_invitation", "")));
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(r);
        }
        int n = 0;
        for (var e : groups.entrySet()) {
            String role = e.getKey().role();
            boolean silent = !e.getKey().invite();
            List<AdminUserImportRequest.UserItem> items = e.getValue().stream().map(r ->
                    new AdminUserImportRequest.UserItem(r.getOrDefault("email", ""), r.getOrDefault("first_name", ""),
                            r.getOrDefault("last_name", ""), nullIfBlank(r.getOrDefault("student_code", "")))).toList();
            var resp = adminService.importUsers(new AdminUserImportRequest(role, items), silent);
            n += resp.created();
            resp.errors().forEach(err -> {
                if (job != null) job.errors.add("users item " + err.item() + " [" + err.field() + "]: " + err.message());
            });
            if (job != null) {
                job.processed += e.getValue().size();
                job.currentStep = "users";
            }
        }
        return n;
    }

    @Transactional
    public int commitProjects(List<Map<String, String>> rows, SeedJob job) {
        int n = 0;
        for (var r : rows) {
            Project p = new Project();
            p.setTitle(r.get("project_title"));
            p.setDescription(nullIfBlank(r.getOrDefault("description", "")));
            String st = r.getOrDefault("status", "CREATED");
            p.setStatus(st.isBlank() ? ProjectStatus.CREATED : ProjectStatus.valueOf(st));
            String std = r.getOrDefault("target_standard", "");
            if (!std.isBlank()) p.setTargetStandard(PaperStandard.valueOf(std));
            p.setActive(true);
            p.setCreatedAt(LocalDateTime.now());
            p.setUpdatedAt(LocalDateTime.now());
            projectRepository.save(p);
            n++;
            if (job != null) {
                job.processed++;
                job.currentStep = "projects";
            }
        }
        return n;
    }

    @Transactional
    public int commitMembers(List<Map<String, String>> rows, SeedJob job) {
        int n = 0;
        for (var r : rows) {
            var project = findProject(r.get("project_title"));
            var user = userRepository.findByEmail(r.getOrDefault("user_email", "").toLowerCase(Locale.ROOT)).orElse(null);
            if (project == null || user == null) {
                if (job != null) job.errors.add("members row " + r.get("_row") + ": unresolvable FK");
                continue;
            }
            if (!memberRepository.findByProjectIdAndUserId(project.getId(), user.getId()).isEmpty()) continue;
            ProjectMember m = new ProjectMember();
            m.setProject(project);
            m.setUser(user);
            m.setRole(ProjectRole.valueOf(r.getOrDefault("project_role", "MEMBER")));
            m.setJoinedAt(LocalDateTime.now());
            memberRepository.save(m);
            n++;
            if (job != null) {
                job.processed++;
                job.currentStep = "members";
            }
        }
        return n;
    }

    @Transactional
    public int commitSources(List<Map<String, String>> rows, SeedJob job) {
        int n = 0;
        for (var r : rows) {
            var project = findProject(r.get("project_title"));
            var uploader = firstMember(project);
            if (project == null || uploader == null) {
                if (job != null) job.errors.add("sources row " + r.get("_row") + ": unresolvable project/member");
                continue;
            }
            String text = r.getOrDefault("abstract_or_text", "");
            Document d = baseDocument(project, uploader, DocumentType.SOURCE,
                    "source-" + slug(r.getOrDefault("title", "untitled")) + ".txt", text);
            d.setDoi(nullIfBlank(r.getOrDefault("doi", "")));
            d.setTitle(nullIfBlank(r.getOrDefault("title", "")));
            d.setAuthors(nullIfBlank(r.getOrDefault("authors", "")));
            d.setPublicationYear(parseInt(r.getOrDefault("publication_year", "")));
            d.setPublisher(nullIfBlank(r.getOrDefault("publisher", "")));
            d.setCitedByCount(parseInt(r.getOrDefault("cited_by_count", "")));
            d = documentRepository.save(d);
            saveText(d, text.isBlank() ? (d.getTitle() == null ? "" : d.getTitle()) : text);
            n++;
            if (job != null) {
                job.processed++;
                job.currentStep = "sources";
            }
        }
        return n;
    }

    @Transactional
    public int commitPapers(List<Map<String, String>> rows, Map<String, Path> zipFiles, SeedJob job) {
        int n = 0;
        for (var r : rows) {
            var project = findProject(r.get("project_title"));
            var uploader = firstMember(project);
            if (project == null || uploader == null) {
                if (job != null) job.errors.add("papers row " + r.get("_row") + ": unresolvable project/member");
                continue;
            }
            String pf = r.getOrDefault("paper_file", "");
            String standard = r.getOrDefault("paper_standard", "").trim().toUpperCase(Locale.ROOT);
            try {
                if (!pf.isBlank() && !zipFiles.isEmpty()) {
                    String norm = pf.replace("\\", "/").replaceAll("^/+", "");
                    Path data = zipFiles.get(norm);
                    if (data == null) {
                        if (job != null) job.errors.add("papers row " + r.get("_row") + ": file not in ZIP: " + norm);
                        continue;
                    }
                    String filename = norm.substring(norm.lastIndexOf('/') + 1);
                    String contentType = filename.endsWith(".pdf") ? "application/pdf"
                            : filename.endsWith(".tex") ? "text/plain" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                    // ponytail: reuse extraction pipeline — uploadDocument streams to MinIO + queues worker
                    var uploaded = documentService.uploadDocument(project.getId(), new PathMultipartFile(filename, filename, contentType, data), DocumentType.PAPER);
                    // attribute uploaded_by to the project instructor (mirrors Instructor-page upload)
                    var instructor = instructorOf(project);
                    if (instructor != null && uploaded.id() != null) {
                        documentRepository.findById(uploaded.id()).ifPresent(doc -> {
                            if (doc.getUploadedBy() == null || !instructor.getId().equals(doc.getUploadedBy().getId())) {
                                doc.setUploadedBy(instructor);
                                documentRepository.save(doc);
                            }
                        });
                    }
                    // images/ siblings in same papers/<slug>/ folder → project media
                    // (README.txt placeholder and non-images are skipped — rejected at preview)
                    String folder = norm.contains("/") ? norm.substring(0, norm.lastIndexOf('/')) : "";
                    for (var e : zipFiles.entrySet()) {
                        if (!folder.isEmpty() && e.getKey().startsWith(folder + "/images/") && isImageEntry(e.getKey())) {
                            String imgName = e.getKey().substring(e.getKey().lastIndexOf('/') + 1);
                            mediaAssetService.upload(new PathMultipartFile(imgName, imgName, guessMime(imgName), e.getValue()), project.getId());
                        }
                    }
                } else if (!standard.isBlank()) {
                    // standard-template paper — mirrors Instructor Page choose-standard
                    // (POST /projects/{id}/papers/init): stub document + sections
                    // generated from the standard, no file upload involved
                    var instructor = instructorOf(project);
                    if (instructor == null || instructor.getRole() != UserRole.INSTRUCTOR) {
                        throw new IllegalStateException("standard paper needs a project member with INSTRUCTOR role");
                    }
                    Document stub = new Document();
                    stub.setProject(project);
                    stub.setUploadedBy(instructor);
                    stub.setDocType(DocumentType.PAPER);
                    stub.setFileUrl("placeholder");
                    stub.setOriginalFilename("_standard_" + standard + ".tex");
                    stub.setContentType("text/plain");
                    stub.setFileSizeBytes(0L);
                    stub.setProcessingStatus(ProcessingStatus.READY);
                    stub.setActive(true);
                    stub.setCreatedAt(LocalDateTime.now());
                    stub.setDownloadToken(UUID.randomUUID().toString());
                    stub = documentRepository.save(stub);
                    // createSectionsFromStandard demands an INSTRUCTOR principal —
                    // run as the project instructor, then restore the caller auth
                    Authentication previous = SecurityContextHolder.getContext().getAuthentication();
                    SecurityContextHolder.getContext().setAuthentication(
                            new UsernamePasswordAuthenticationToken(instructor, null, List.of()));
                    try {
                        paperProcessingService.createSectionsFromStandard(stub.getId(), standard);
                    } finally {
                        SecurityContextHolder.getContext().setAuthentication(previous);
                    }
                } else {
                    String text = r.getOrDefault("content_tex", "");
                    Document d = baseDocument(project, uploader, DocumentType.PAPER,
                            "paper-" + slug(r.getOrDefault("title", project.getTitle())) + ".txt", text);
                    d.setTitle(nullIfBlank(r.getOrDefault("title", "")));
                    d = documentRepository.save(d);
                    saveText(d, text);
                }
                n++;
            } catch (Exception e) {
                if (job != null) job.errors.add("papers row " + r.get("_row") + ": " + e.getMessage());
            }
            if (job != null) {
                job.processed++;
                job.currentStep = "papers";
            }
        }
        return n;
    }

    @Transactional
    public int commitSections(List<Map<String, String>> rows, SeedJob job) {
        int n = 0;
        for (var r : rows) {
            var project = findProject(r.get("project_title"));
            if (project == null) {
                if (job != null) job.errors.add("sections row " + r.get("_row") + ": unknown project");
                continue;
            }
            var papers = documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.PAPER);
            if (papers.isEmpty()) {
                if (job != null) job.errors.add("sections row " + r.get("_row") + ": project has no paper");
                continue;
            }
            Document paper = papers.get(0);
            PaperSection s = new PaperSection();
            s.setDocument(paper);
            s.setSectionTitle(r.getOrDefault("section_title", "Untitled"));
            try {
                s.setSectionOrder(Integer.parseInt(r.getOrDefault("section_order", "0")));
            } catch (NumberFormatException e) {
                s.setSectionOrder(0);
            }
            s.setContentTex(r.getOrDefault("content_tex", ""));
            String assignee = r.getOrDefault("assigned_user_email", "").toLowerCase(Locale.ROOT);
            if (!assignee.isBlank()) {
                userRepository.findByEmail(assignee).ifPresent(s::setAssignedUser);
            }
            s.setVersion(1);
            s.setActive(true);
            s.setUpdatedAt(LocalDateTime.now());
            paperSectionRepository.save(s);
            n++;
            if (job != null) {
                job.processed++;
                job.currentStep = "sections";
            }
        }
        return n;
    }

    // ---------- helpers ----------

    private Project findProject(String title) {
        if (title == null || title.isBlank()) return null;
        return projectRepository.findAll().stream()
                .filter(p -> title.equals(p.getTitle())).findFirst().orElse(null);
    }

    /**
     * Uploader attribution mirroring the Instructor page: prefer the project's
     * INSTRUCTOR member, else first member, else any user. Auth checks still run
     * as the propagated ADMIN (which bypasses project write checks).
     */
    private User instructorOf(Project project) {
        if (project == null) return null;
        var members = memberRepository.findByProjectId(project.getId());
        for (var m : members) {
            if (m.getRole() == ProjectRole.INSTRUCTOR && m.getUser() != null) return m.getUser();
        }
        for (var m : members) {
            if (m.getUser() != null) return m.getUser();
        }
        return userRepository.findAll().stream().findFirst().orElse(null);
    }

    private User firstMember(Project project) {
        return instructorOf(project);
    }

    private Document baseDocument(Project p, User by, DocumentType type, String filename, String content) {
        Document d = new Document();
        d.setProject(p);
        d.setUploadedBy(by);
        d.setDocType(type);
        d.setFileUrl("seed/" + filename);
        d.setOriginalFilename(filename);
        d.setContentType("text/plain");
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        d.setFileSizeBytes((long) bytes.length);
        try {
            d.setFileHashSha256(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        d.setProcessingStatus(ProcessingStatus.READY);
        d.setActive(true);
        d.setDownloadToken(UUID.randomUUID().toString());
        d.setProcessedAt(LocalDateTime.now());
        d.setCreatedAt(LocalDateTime.now());
        return d;
    }

    private void saveText(Document d, String content) {
        DocumentText dt = new DocumentText();
        dt.setDocument(d);
        dt.setExtractedText(content == null ? "" : content);
        dt.setExtractionMethod("EXCEL_SEED");
        documentTextRepository.save(dt);
        d.setChunkCount(1);
        documentRepository.save(d);
        var c = new com.evidencepilot.model.DocumentChunk();
        c.setDocument(d);
        c.setChunkIndex(0);
        c.setText(content.length() > 2000 ? content.substring(0, 2000) : content);
        c.setActive(true);
        documentChunkRepository.save(c);
    }

    private static String slug(String v) {
        String s = v == null ? "" : v.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        return s.isBlank() ? "untitled" : s;
    }

    private static String nullIfBlank(String v) {
        return v == null || v.isBlank() ? null : v;
    }

    private static Integer parseInt(String v) {
        try {
            return v == null || v.isBlank() ? null : Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String guessMime(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".gif")) return "image/gif";
        return "application/octet-stream";
    }

    private static String str(Cell c) {
        if (c == null) return "";
        if (c.getCellType() == CellType.NUMERIC) {
            double d = c.getNumericCellValue();
            return d == Math.floor(d) ? String.valueOf((long) d) : String.valueOf(d);
        }
        if (c.getCellType() == CellType.BOOLEAN) return String.valueOf(c.getBooleanCellValue());
        return c.toString();
    }

    private static boolean isBlankRow(Row row, int cols) {
        for (int i = 0; i < cols; i++) {
            if (!str(row.getCell(i)).isBlank()) return false;
        }
        return true;
    }

    /** Disk-backed MultipartFile for spooled ZIP entries (spring-test MockMultipartFile is test-scoped). */
    public record PathMultipartFile(String name, String originalFilename, String contentType, Path path) implements MultipartFile {
        @Override
        public String getName() {
            return name;
        }

        @Override
        public String getOriginalFilename() {
            return originalFilename;
        }

        @Override
        public String getContentType() {
            return contentType;
        }

        public boolean isEmpty() {
            try {
                return path == null || Files.size(path) == 0;
            } catch (IOException e) {
                return true;
            }
        }

        public long getSize() {
            try {
                return path == null ? 0 : Files.size(path);
            } catch (IOException e) {
                return 0;
            }
        }

        public byte[] getBytes() throws IOException {
            return Files.readAllBytes(path);
        }

        public InputStream getInputStream() throws IOException {
            return Files.newInputStream(path);
        }

        public void transferTo(java.io.File dest) throws IOException {
            Files.copy(path, dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
