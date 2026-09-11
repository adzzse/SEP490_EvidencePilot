package com.evidencepilot.service;

import com.evidencepilot.client.openalex.DoiUtils;
import com.evidencepilot.client.openalex.OpenAlexClient;
import com.evidencepilot.dto.openalex.OpenAlexWorkResponse;
import com.evidencepilot.dto.request.AdminUserImportRequest;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentText;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.AccountStatus;
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
import com.evidencepilot.service.impl.DocumentPersistenceService;
import com.evidencepilot.service.impl.ProjectCollectionService;
import com.evidencepilot.service.OpenAlexIngestionService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PreDestroy;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

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
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Excel + folder-per-paper ZIP seed. Streaming-light: caps enforced
 * (6 sheets, 200 rows/sheet with members at 500, 10MB xlsx). ZIP bundles are uncapped and
 * spooled entry-by-entry to temp files (never heap) with per-job cleanup.
 * Reuses AdminService user validation, DocumentService extraction pipeline,
 * MediaAssetService for images. Async jobs with in-memory progress (pollable).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminExcelSeedService {

    private static final int MAX_ROWS_DEFAULT = 200;
    // ponytail: member rows are cheap single inserts; 3-5 students per project
    // across 60+ projects exceeds the default cap, so members get headroom
    private static final int MAX_ROWS_MEMBERS = 500;
    private static final long MAX_XLSX_BYTES = 10L * 1024 * 1024;
    // ponytail: no "sections" sheet — file-backed papers get sections from extraction,
    // standard papers from createSectionsFromStandard; a legacy sheet is ignored by parse
    private static final List<String> SHEETS = List.of("users", "projects", "members", "sources", "papers", "collections");
    private static final Set<String> INVITE_TRUE_TOKENS = Set.of("TRUE", "1", "YES", "Y");
    private static final Set<String> INVITE_FALSE_TOKENS = Set.of("FALSE", "0", "NO", "N");
    // ponytail: mirrors OpenAlexIngestionServiceImpl — per-PDF cap + header scan
    private static final long MAX_SEED_PDF_BYTES = 50L * 1024 * 1024;
    private static final byte[] PDF_SIGNATURE = {'%', 'P', 'D', 'F', '-'};

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
    private final OpenAlexClient openAlexClient;
    private final OpenAlexIngestionService openAlexIngestionService;
    private final DocumentObjectStorage documentObjectStorage;
    private final DocumentPersistenceService documentPersistenceService;
    private final ProjectCollectionService projectCollectionService;
    private final ObjectMapper objectMapper;
    private final DevBypassPolicy seedPolicy;
    private final PlatformTransactionManager transactionManager;

    @Value("${app.seed.max-upload-bytes:268435456}")
    private long maxUploadBytes = 256L * 1024 * 1024;
    @Value("${app.seed.max-expanded-bytes:536870912}")
    private long maxExpandedBytes = 512L * 1024 * 1024;
    @Value("${app.seed.max-entries:2000}")
    private int maxEntries = 2000;

    private final ExecutorService executor = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
            new SynchronousQueue<>(), runnable -> {
                Thread thread = new Thread(runnable, "admin-seed");
                thread.setDaemon(true);
                return thread;
            });
    private final AtomicBoolean importReserved = new AtomicBoolean();
    private final ConcurrentHashMap<UUID, SeedJob> jobs = new ConcurrentHashMap<>();

    @Getter
    public static class SeedJob {
        private final UUID id = UUID.randomUUID();
        private volatile String status = "QUEUED"; // QUEUED|RUNNING|DONE|PARTIAL|FAILED
        private volatile int total;
        private volatile int processed;
        private volatile boolean complete;
        private volatile int successfulRows;
        private volatile int failedRows;
        private volatile int skippedRows;
        private volatile String currentStep = "";
        private int pendingRows;
        private final List<String> errors = java.util.Collections.synchronizedList(new ArrayList<>());
        private volatile Map<String, Integer> result = Map.of();
        private volatile long completedAt;

        public List<String> getErrors() {
            synchronized (errors) {
                return List.copyOf(errors);
            }
        }

        private void startRows(String step, int count) {
            currentStep = step;
            pendingRows = count;
        }

        private void addCount(String key, int count) {
            var counts = new LinkedHashMap<>(result);
            counts.merge(key, count, Integer::sum);
            result = java.util.Collections.unmodifiableMap(counts);
        }

        private void succeeded(String step, int count) {
            successfulRows += count;
            processed += count;
            pendingRows = 0;
            addCount(step, count);
        }

        private void failed(String message, int count) {
            errors.add(message);
            failedRows += count;
            processed += count;
            pendingRows = 0;
        }

        private void skipped(String message, int count) {
            errors.add(message);
            skippedRows += count;
            processed += count;
            pendingRows = 0;
        }
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
                            List.of("Bundle = seed.xlsx + papers/<slug>/ folders only. Fill users→projects→members→sources→papers→collections. Reference by email/project_title/doi. Sections come from extraction (file papers) or the standard (paper_standard papers) — no sections sheet."),
                            List.of("papers.paper_folder must equal the <slug> in papers.paper_file (^[a-z0-9-]{1,80}$). Main file must be named <slug>.pdf|.docx|.tex after its folder; images/ goes beside it."),
                            List.of("Precedence: paper_file, then paper_standard, then content_tex. Max 1 paper per project. xlsx<=10MiB, bounded ZIP spooled to disk, 200 rows/sheet (members: 500)."),
                            List.of("paper_standard (IEEE|ACM|...) creates a standard-template paper like Instructor Page choose-standard: leave paper_file and content_tex blank, sections are generated."),
                            List.of("users.send_invitation: TRUE requests a set-password invitation; FALSE or blank sends nothing and requires explicitly enabled dev/test bypass. Production rejects silent rows."),
                            List.of("Project titles are aliases for this import only; existing titles are rejected. Use writable initial states, never seed a submitted review."),
                            List.of("File papers: wait until extraction is READY, then apply content/assignment using existing paper section APIs/UI. Do not re-upload this bundle to update an existing project."),
                            List.of("Standard templates generate their own section orders; conflicting section rows are reported, never overwritten."),
                            List.of("sources.doi is required and resolved live via OpenAlex (metadata + PDF win over sheet columns); rows without OA PDF import as METADATA_FETCHED for later file attach.")));
            sheet(wb, "users", List.of("email", "first_name", "last_name", "role", "student_code", "send_invitation"),
                    List.of(List.of("demo01@example.test", "An", "Nguyen", "STUDENT", "AB123456", "FALSE"),
                            List.of("prof@example.test", "Binh", "Tran", "INSTRUCTOR", "", "TRUE")));
            sheet(wb, "projects", List.of("project_title", "description", "status", "target_standard"),
                    List.of(List.of("EP-DEMO-Retrieval", "Demo project", "IN_PROGRESS", "CUSTOM")));
            sheet(wb, "members", List.of("project_title", "user_email", "project_role"),
                    List.of(List.of("EP-DEMO-Retrieval", "demo01@example.test", "LEADER"),
                            List.of("EP-DEMO-Retrieval", "prof@example.test", "INSTRUCTOR")));
            sheet(wb, "sources", List.of("project_title", "doi", "title", "authors", "publication_year", "publisher", "cited_by_count", "abstract_or_text"),
                    List.of(List.of("EP-DEMO-Retrieval", "10.48550/arXiv.2004.04906", "Dense Passage Retrieval for Open-Domain Question Answering", "Karpukhin, V.; et al.", "2020", "arXiv", "5600", "Reference only — live OpenAlex metadata wins at import.")));
            sheet(wb, "papers", List.of("project_title", "paper_folder", "paper_file", "title", "content_tex", "paper_standard"),
                    List.of(List.of("EP-DEMO-Retrieval", "attention-retrieval", "papers/attention-retrieval/attention-retrieval.tex", "Attention demo", "", "")));
            sheet(wb, "collections", List.of("collection_title", "description", "owner_email", "source_dois"),
                    List.of(List.of("EP-DEMO-Retrieval Methods", "Shared method papers", "prof@example.test", "10.48550/arXiv.2004.04906")));
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
                int rowCap = "members".equals(name) ? MAX_ROWS_MEMBERS : MAX_ROWS_DEFAULT;
                for (int r = 1; r <= s.getLastRowNum(); r++) {
                    Row row = s.getRow(r);
                    if (row == null || isBlankRow(row, headers.size())) continue;
                    if (rows.size() >= rowCap) {
                        errors.add(name + ": exceeds " + rowCap + " rows");
                        break;
                    }
                    Map<String, String> m = new LinkedHashMap<>();
                    for (int c = 0; c < headers.size(); c++) m.put(headers.get(c), str(row.getCell(c)).trim());
                    m.put("_row", String.valueOf(r + 1));
                    rows.add(m);
                }
                sheets.put(name, rows);
            }
        } catch (org.apache.poi.ooxml.POIXMLException | org.apache.poi.openxml4j.exceptions.NotOfficeXmlFileException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid XLSX workbook", ex);
        }
        errors.addAll(validate(sheets));
        return new ParsedSeed(sheets, errors);
    }

    /**
     * Counts actual expanded bytes while spooling; the caller owns cleanup
     * until submit succeeds, after which the worker owns this directory.
     */
    public ZipBundle readZip(InputStream in) throws IOException {
        List<String> errors = new ArrayList<>();
        Path spoolDir = Files.createTempDirectory("seed-zip-");
        try {
            Map<String, Path> files = new LinkedHashMap<>();
            Set<String> seen = new java.util.HashSet<>();
            long expandedBytes = 0;
            int entries = 0;
            byte[] buffer = new byte[8192];
            try (ZipInputStream zip = new ZipInputStream(in, StandardCharsets.UTF_8)) {
                ZipEntry e;
                while ((e = zip.getNextEntry()) != null) {
                    if (++entries > maxEntries) {
                        throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "ZIP entry limit exceeded");
                    }
                    String name = e.getName().replace('\\', '/');
                    if (name.isBlank() || name.startsWith("/") || name.matches(".*[<>:\"|?*\\p{Cntrl}].*")) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Illegal ZIP path");
                    }
                    for (String segment : name.split("/")) {
                        if (segment.equals("..") || segment.endsWith(" ") || (segment.endsWith(".") && !segment.equals("."))
                                || segment.toUpperCase(Locale.ROOT).matches("(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\\..*)?")) {
                            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Illegal ZIP path");
                        }
                    }
                    Path target = spoolDir.resolve(name).normalize();
                    if (!target.startsWith(spoolDir) || target.equals(spoolDir)) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Illegal ZIP path");
                    }
                    String normalized = spoolDir.relativize(target).toString().replace('\\', '/');
                    if (!seen.add(normalized.toLowerCase(Locale.ROOT))) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate ZIP path");
                    }
                    Files.createDirectories(e.isDirectory() ? target : target.getParent());
                    try (var out = e.isDirectory() ? java.io.OutputStream.nullOutputStream() : Files.newOutputStream(target)) {
                        int read;
                        while ((read = zip.read(buffer)) != -1) {
                            if (read > maxExpandedBytes - expandedBytes) {
                                throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "ZIP expansion limit exceeded");
                            }
                            expandedBytes += read;
                            out.write(buffer, 0, read);
                        }
                    }
                    if (!e.isDirectory()) files.put(normalized, target);
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
                        } catch (IOException failure) {
                            log.warn("Seed temporary file cleanup failed ({})", failure.getClass().getSimpleName());
                        }
                    });
        } catch (IOException failure) {
            log.warn("Seed temporary directory cleanup failed ({})", failure.getClass().getSimpleName());
        }
    }

    public void checkUploadSize(long size) {
        if (size < 0 || size > maxUploadBytes) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Seed upload limit exceeded");
        }
    }

    public byte[] readXlsx(InputStream in, long size) throws IOException {
        if (size > MAX_XLSX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "XLSX exceeds 10MiB limit");
        }
        byte[] bytes = in.readNBytes((int) MAX_XLSX_BYTES + 1);
        if (bytes.length > MAX_XLSX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "XLSX exceeds 10MiB limit");
        }
        return bytes;
    }

    public boolean tryReserveImport() {
        return importReserved.compareAndSet(false, true);
    }

    public void releaseImport() {
        importReserved.set(false);
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
    }

    private void pruneJobs() {
        var terminal = jobs.values().stream().filter(job -> job.completedAt != 0)
                .sorted(java.util.Comparator.comparingLong(job -> job.completedAt)).toList();
        terminal.stream().limit(Math.max(0, terminal.size() - 50)).forEach(job -> jobs.remove(job.id, job));
    }

    // ---------- validate (dry-run, no writes) ----------

    List<String> validate(Map<String, List<Map<String, String>>> sheets) {
        List<String> errors = new ArrayList<>();
        if (!seedPolicy.allowsSeedAccounts() && sheets.getOrDefault("users", List.of()).stream()
                .anyMatch(row -> !sendInvitationRequested(row.getOrDefault("send_invitation", "")))) {
            errors.add("Silent seed requires enabled dev/test bypass; production rows must explicitly request invitations");
        }
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
                if (v.isReadOnly() || v == ProjectStatus.SUBMITTED_FOR_REVIEW) errors.add(at + "read-only/review status not allowed on seed: " + st);
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
        for (var r : sheets.getOrDefault("sources", List.of())) {
            String at = "sources row " + r.get("_row") + ": ";
            if (!titles.contains(r.getOrDefault("project_title", ""))) errors.add(at + "unknown project_title");
            String doi = DoiUtils.normalize(r.getOrDefault("doi", ""));
            if (doi == null || doi.isBlank()) errors.add(at + "doi is required (DOI-in seed)");
            else if (!DoiUtils.isValid(doi)) errors.add(at + "invalid DOI format: " + r.getOrDefault("doi", ""));
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
        var instructorEmails = new java.util.HashSet<String>();
        for (var r : sheets.getOrDefault("users", List.of())) {
            if ("INSTRUCTOR".equals(r.getOrDefault("role", "").toUpperCase(Locale.ROOT))) {
                instructorEmails.add(r.getOrDefault("email", "").toLowerCase(Locale.ROOT));
            }
        }
        var sourceDois = new java.util.HashSet<String>();
        for (var r : sheets.getOrDefault("sources", List.of())) {
            String doi = DoiUtils.normalize(r.getOrDefault("doi", ""));
            if (doi != null && !doi.isBlank()) sourceDois.add(doi.toLowerCase(Locale.ROOT));
        }
        var collectionTitles = new java.util.HashSet<String>();
        for (var r : sheets.getOrDefault("collections", List.of())) {
            String at = "collections row " + r.get("_row") + ": ";
            if (r.getOrDefault("collection_title", "").isBlank()) errors.add(at + "collection_title required");
            else if (!collectionTitles.add(r.get("collection_title"))) errors.add(at + "duplicate collection_title");
            String owner = r.getOrDefault("owner_email", "").toLowerCase(Locale.ROOT);
            if (!instructorEmails.contains(owner)) errors.add(at + "owner_email must be a users-sheet INSTRUCTOR");
            List<String> dois = splitSemiDois(r.getOrDefault("source_dois", ""));
            if (dois.isEmpty()) errors.add(at + "source_dois requires at least one DOI");
            for (String doi : dois) {
                String normalized = DoiUtils.normalize(doi);
                if (!DoiUtils.isValid(normalized)) errors.add(at + "invalid DOI format: " + doi);
                else if (!sourceDois.contains(normalized.toLowerCase(Locale.ROOT))) {
                    errors.add(at + "unknown sources-sheet doi: " + doi);
                }
            }
        }
        return errors;
    }

    static List<String> splitSemiDois(String raw) {
        List<String> dois = new ArrayList<>();
        if (raw == null) return dois;
        for (String part : raw.split(";")) {
            String doi = part.trim();
            if (!doi.isBlank()) dois.add(doi);
        }
        return dois;
    }

    // ---------- async jobs ----------

    public SeedJob submit(byte[] xlsx, ZipBundle bundle, BiConsumer<SeedJob, String> log) {
        if (!importReserved.get()) throw new IllegalStateException("Reserve a seed import before submission");
        ZipBundle safe = bundle == null ? new ZipBundle(Map.of(), List.of()) : bundle;
        ParsedSeed parsed;
        try {
            parsed = parse(new ByteArrayInputStream(xlsx), xlsx.length);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid XLSX workbook", ex);
        }
        List<String> errors = new ArrayList<>(parsed.errors());
        errors.addAll(safe.errors());
        errors.addAll(checkZipLayout(parsed.sheets(), safe.files()));
        if (!errors.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, String.join("; ", errors));
        preflight(parsed.sheets());
        pruneJobs();
        SeedJob job = new SeedJob();
        job.total = parsed.sheets().values().stream().mapToInt(List::size).sum();
        jobs.put(job.getId(), job);
        // ponytail: worker thread has no SecurityContext — capture the requesting
        // ADMIN auth so uploadDocument/media/importUsers don't 401 (ADMIN bypasses
        // project write checks in CurrentUserServiceImpl).
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        try {
            executor.execute(() -> runJob(job, parsed, safe, auth));
        } catch (RejectedExecutionException ex) {
            jobs.remove(job.id);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Seed worker is busy; retry shortly", ex);
        }
        return job;
    }

    public SeedJob get(UUID id) {
        return jobs.get(id);
    }

    private void preflight(Map<String, List<Map<String, String>>> sheets) {
        var titles = sheets.getOrDefault("projects", List.of()).stream().map(row -> row.get("project_title")).toList();
        if (titles.stream().map(title -> title.toLowerCase(Locale.ROOT)).distinct().count() != titles.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate project aliases");
        }
        if (!titles.isEmpty() && !projectRepository.findExistingTitles(titles).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project title already exists; use new aliases or the existing project APIs");
        }
        var emails = new java.util.HashSet<String>();
        for (var row : sheets.getOrDefault("users", List.of())) emails.add(row.get("email").toLowerCase(Locale.ROOT));
        for (var row : sheets.getOrDefault("members", List.of())) emails.add(row.getOrDefault("user_email", "").toLowerCase(Locale.ROOT));
        for (var row : sheets.getOrDefault("sections", List.of())) {
            if (!row.getOrDefault("assigned_user_email", "").isBlank()) emails.add(row.get("assigned_user_email").toLowerCase(Locale.ROOT));
        }
        Map<String, User> users = new LinkedHashMap<>();
        if (!emails.isEmpty()) userRepository.findAllByEmailIn(emails).forEach(user -> users.put(user.getEmail().toLowerCase(Locale.ROOT), user));
        for (var row : sheets.getOrDefault("users", List.of())) {
            String email = row.get("email").toLowerCase(Locale.ROOT);
            UserRole role = UserRole.valueOf(row.get("role").toUpperCase(Locale.ROOT));
            User existing = users.get(email);
            if (existing != null && (existing.getRole() != role || existing.getAccountStatus() == AccountStatus.DELETED)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "User " + email + " already exists with a different role/status");
            }
        }
    }

    private void runJob(SeedJob job, ParsedSeed parsed, ZipBundle bundle, Authentication auth) {
        job.status = "RUNNING";
        var context = SecurityContextHolder.getContext();
        Authentication previous = context.getAuthentication();
        context.setAuthentication(auth);
        try {
            job.result = Map.of("users", 0, "projects", 0, "members", 0, "sources", 0, "papers", 0, "sections", 0);
            var userRows = parsed.sheets().getOrDefault("users", List.of());
            commitUsers(userRows, job);
            var projects = commitProjects(parsed.sheets().getOrDefault("projects", List.of()), job);
            commitMembers(parsed.sheets().getOrDefault("members", List.of()), job, projects);
            commitSources(parsed.sheets().getOrDefault("sources", List.of()), job, projects);
            commitPapers(parsed.sheets().getOrDefault("papers", List.of()), bundle.files(), job, projects);
            commitSections(parsed.sheets().getOrDefault("sections", List.of()), job, projects);
        } catch (Exception e) {
            log.error("Seed job {} failed", job.getId(), e);
            job.failed(job.currentStep + ": " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()), job.pendingRows);
        } finally {
            context.setAuthentication(previous);
            deleteSpoolDir(bundle.spoolDir());
            int remaining = job.total - job.processed;
            if (remaining > 0) job.skipped("Unprocessed rows skipped after job failure", remaining);
            job.complete = job.errors.isEmpty() && job.failedRows == 0 && job.skippedRows == 0 && job.processed == job.total;
            job.status = job.complete ? "DONE" : job.successfulRows > 0 ? "PARTIAL" : "FAILED";
            job.completedAt = System.nanoTime();
            pruneJobs();
            releaseImport();
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

    public int commitUsers(List<Map<String, String>> rows, SeedJob job) {
        if (rows.isEmpty()) return 0;
        if (rows.stream().anyMatch(row -> !sendInvitationRequested(row.getOrDefault("send_invitation", "")))) {
            seedPolicy.allowOrThrow();
        }
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
            if (job != null) job.startRows("users", e.getValue().size());
            String role = e.getKey().role();
            boolean silent = !e.getKey().invite();
            List<AdminUserImportRequest.UserItem> items = e.getValue().stream().map(r ->
                    new AdminUserImportRequest.UserItem(r.getOrDefault("email", ""), r.getOrDefault("first_name", ""),
                            r.getOrDefault("last_name", ""), nullIfBlank(r.getOrDefault("student_code", "")))).toList();
            var resp = adminService.importUsers(new AdminUserImportRequest(role, items), silent);
            int succeeded = resp.created() + resp.updated();
            n += succeeded;
            resp.errors().forEach(err -> {
                if (job != null) job.errors.add("users item " + err.item() + " [" + err.field() + "]: " + err.message());
            });
            if (job != null) {
                job.succeeded("users", succeeded);
                job.addCount("users_created", resp.created());
                job.addCount("users_updated", resp.updated());
                job.addCount("users_invitation_requested", silent ? 0 : resp.created());
                job.addCount("users_silent_created", silent ? resp.created() : 0);
                int unsuccessful = e.getValue().size() - succeeded;
                int failed = resp.errors().stream().anyMatch(error -> error.item() == 0) ? unsuccessful
                        : Math.min(unsuccessful, (int) resp.errors().stream().map(err -> err.item()).distinct().count());
                job.failedRows += failed;
                job.processed += failed;
                if (unsuccessful > failed) job.skipped("users: rows skipped because their import batch could not complete", unsuccessful - failed);
            }
        }
        return n;
    }

    public Map<String, Project> commitProjects(List<Map<String, String>> rows, SeedJob job) {
        Map<String, Project> projects = new LinkedHashMap<>();
        for (var r : rows) {
            if (job != null) job.startRows("projects", 1);
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
            projects.put(r.get("project_title"), projectRepository.save(p));
            if (job != null) {
                job.succeeded("projects", 1);
            }
        }
        return projects;
    }

    public int commitMembers(List<Map<String, String>> rows, SeedJob job, Map<String, Project> projects) {
        int n = 0;
        for (var r : rows) {
            if (job != null) job.startRows("members", 1);
            var project = projects.get(r.get("project_title"));
            var user = userRepository.findByEmail(r.getOrDefault("user_email", "").toLowerCase(Locale.ROOT)).orElse(null);
            if (project == null || user == null) {
                if (job != null) job.skipped("members row " + r.get("_row") + ": unresolvable FK", 1);
                continue;
            }
            if (!memberRepository.findByProjectIdAndUserId(project.getId(), user.getId()).isEmpty()) {
                if (job != null) job.skipped("members row " + r.get("_row") + ": duplicate membership", 1);
                continue;
            }
            ProjectMember m = new ProjectMember();
            m.setProject(project);
            m.setUser(user);
            m.setRole(ProjectRole.valueOf(r.getOrDefault("project_role", "MEMBER")));
            m.setJoinedAt(LocalDateTime.now());
            memberRepository.save(m);
            n++;
            if (job != null) {
                job.succeeded("members", 1);
            }
        }
        return n;
    }

    /**
     * DOI-in sources: each row resolves its DOI via OpenAlex and goes through the
     * same pipeline as manual DOI ingest — live metadata wins over sheet columns,
     * PDFs land in MinIO, extraction is queued, preview works via download link.
     * Deliberately NOT @Transactional: each row does live network I/O that must
     * not pin one DB transaction for the whole sheet. Each repository call and
     * markDocumentAsUploaded runs in its own transaction.
     */
    public int commitSources(List<Map<String, String>> rows, SeedJob job, Map<String, Project> projects) {
        int n = 0;
        // per-job cache: unique DOIs resolve + download once, reused across projects
        Map<String, ResolvedSourceDoi> cache = new LinkedHashMap<>();
        for (var r : rows) {
            if (job != null) job.startRows("sources", 1);
            var project = projects.get(r.get("project_title"));
            var uploader = instructorOf(project);
            if (project == null || uploader == null) {
                if (job != null) job.skipped("sources row " + r.get("_row") + ": unresolvable project/member", 1);
                continue;
            }
            String doi = DoiUtils.normalize(r.getOrDefault("doi", ""));
            if (!DoiUtils.isValid(doi)) {
                if (job != null) job.failed("sources row " + r.get("_row") + ": invalid DOI format", 1);
                continue;
            }
            if (documentRepository.countActiveProjectSourcesByDoi(project.getId(), DocumentType.SOURCE, doi) > 0) {
                if (job != null) job.skipped("sources row " + r.get("_row") + ": DOI already in project — skipped", 1);
                continue;
            }
            ResolvedSourceDoi resolved = cache.get(doi);
            if (resolved == null) {
                OpenAlexWorkResponse work;
                if (isDataCiteArxivDoi(doi)) {
                    // ponytail: 10.48550/arXiv.* are DataCite location DOIs —
                    // /works/doi: always 404s, so skip the doomed lookup and go
                    // straight to title match / sheet metadata.
                    log.info("Skipping direct OpenAlex lookup for DataCite DOI {}", doi);
                    work = resolveWithoutDoi(r, doi);
                } else {
                    try {
                        work = openAlexClient.fetchWork(doi);
                    } catch (Exception e) {
                        work = resolveWithoutDoi(r, doi);
                    }
                }
                if (work == null) {
                    if (job != null) job.failed("sources row " + r.get("_row") + ": DOI not resolvable: " + doi, 1);
                    continue;
                }
                byte[] pdf = null;
                String downloadNote = null;
                String oaUrl = work.oaUrl();
                if ((oaUrl == null || oaUrl.isBlank()) && arxivId(doi) != null) {
                    // ponytail: title-matched works often lack an OA PDF URL even
                    // though the arXiv e-print is freely downloadable
                    oaUrl = "https://arxiv.org/pdf/" + arxivId(doi);
                }
                if (oaUrl == null || oaUrl.isBlank()) {
                    downloadNote = "No open-access PDF available for this DOI";
                } else {
                    try (var pdfStream = openAlexClient.downloadPdf(oaUrl)) {
                        byte[] raw = pdfStream.readNBytes((int) (MAX_SEED_PDF_BYTES + 1));
                        if (raw.length > MAX_SEED_PDF_BYTES) throw new IllegalArgumentException("exceeds 50MB");
                        if (!hasPdfSignature(raw)) throw new IllegalArgumentException("not a valid PDF (bot-block?)");
                        pdf = raw;
                    } catch (Exception e) {
                        downloadNote = "PDF download not completed: " + e.getMessage() + ". Metadata saved.";
                    }
                }
                resolved = new ResolvedSourceDoi(work, pdf, downloadNote);
                cache.put(doi, resolved);
            }
            // build row from LIVE work (field mapping mirrors OpenAlexIngestionServiceImpl)
            var work = resolved.work();
            Document d = new Document();
            d.setProject(project);
            d.setUploadedBy(uploader);
            d.setDocType(DocumentType.SOURCE);
            d.setFileUrl("pending");
            d.setContentType("application/pdf");
            d.setFileSizeBytes(0L);
            d.setActive(true);
            d.setCreatedAt(LocalDateTime.now());
            d.setDownloadToken(UUID.randomUUID().toString());
            d.setOriginalFilename(work.title() != null ? work.title() + ".pdf" : doi + ".pdf");
            d.setDoi(doi);
            d.setTitle(work.title());
            d.setAuthors(toJson(work.authorNames()));
            d.setPublicationYear(work.publicationYear());
            d.setPublisher(work.publisher());
            d.setCitedByCount(work.citedByCount());
            // ponytail: non-null before the first save — leaving it unset crashed
            // MySQL NOT NULL inserts (mirrors OpenAlexIngestionServiceImpl)
            d.setProcessingStatus(ProcessingStatus.METADATA_FETCHED);
            if (work.primaryTopic() != null) {
                d.setOpenAlexTopic(work.primaryTopic().displayName());
                if (work.primaryTopic().subfield() != null) {
                    d.setOpenAlexSubfield(work.primaryTopic().subfield().displayName());
                }
                if (work.primaryTopic().field() != null) {
                    d.setOpenAlexField(work.primaryTopic().field().displayName());
                }
                if (work.primaryTopic().domain() != null) {
                    d.setOpenAlexDomain(work.primaryTopic().domain().displayName());
                }
            }
            d = documentRepository.save(d);
            if (resolved.pdfBytes() == null) {
                d.setProcessingStatus(ProcessingStatus.METADATA_FETCHED);
                d.setProcessingError(resolved.note() != null ? resolved.note() : "No open-access PDF available for this DOI");
                documentRepository.save(d);
            } else {
                String objectKey = "sources/raw/" + d.getId() + ".pdf";
                try {
                    String hash = documentObjectStorage.writeWithSha256(objectKey, resolved.pdfBytes(), "application/pdf");
                    documentObjectStorage.deleteOnRollback(objectKey);
                    d.setFileSizeBytes((long) resolved.pdfBytes().length);
                    d = documentPersistenceService.markDocumentAsUploaded(d.getId(), objectKey, hash);
                } catch (Exception e) {
                    try {
                        documentObjectStorage.delete(objectKey);
                    } catch (RuntimeException cleanupFailure) {
                        e.addSuppressed(cleanupFailure);
                    }
                    log.warn("Seed PDF upload failed for DOI {}: {}. Metadata saved.", doi, e.getMessage());
                    d.setProcessingStatus(ProcessingStatus.METADATA_FETCHED);
                    d.setProcessingError("PDF download not completed: " + e.getMessage() + ". Metadata saved.");
                    documentRepository.save(d);
                }
            }
            projectCollectionService.syncSource(d);
            // ponytail: the visual/citation maps read saved DocumentReference rows —
            // without this, seeded sources render as isolated nodes with no edges
            try {
                openAlexIngestionService.persistCitationGraph(d, resolved.work());
            } catch (RuntimeException e) {
                log.warn("Seed citation graph persist failed for DOI {}", doi, e);
            }
            n++;
            if (job != null) {
                job.succeeded("sources", 1);
            }
        }
        return n;
    }

    private record ResolvedSourceDoi(OpenAlexWorkResponse work, byte[] pdfBytes, String note) {
    }

    /**
     * Collections sheet: creates instructor-owned collections and links the
     * referenced sources-sheet DOIs as member documents (visual-map ready).
     * Runs after sources so member documents already exist.
     */
    public int commitCollections(List<Map<String, String>> rows, SeedJob job) {
        int n = 0;
        int links = 0;
        for (var r : rows) {
            var owner = userRepository.findByEmail(
                    r.getOrDefault("owner_email", "").toLowerCase(Locale.ROOT)).orElse(null);
            if (owner == null || owner.getRole() != UserRole.INSTRUCTOR) {
                if (job != null) job.errors.add("collections row " + r.get("_row") + ": unresolvable owner");
                continue;
            }
            var collection = projectCollectionService.createSeedCollection(
                    owner,
                    r.getOrDefault("collection_title", "").trim(),
                    nullIfBlank(r.getOrDefault("description", "")));
            var seenDocs = new java.util.HashSet<UUID>();
            for (String doi : splitSemiDois(r.getOrDefault("source_dois", ""))) {
                String normalized = DoiUtils.normalize(doi);
                if (!DoiUtils.isValid(normalized)) continue;
                for (Document doc : documentRepository.findActiveSourcesByDoi(DocumentType.SOURCE, normalized)) {
                    if (!seenDocs.add(doc.getId())) continue;
                    projectCollectionService.addSource(doc, collection, owner);
                    links++;
                }
            }
            n++;
            if (job != null) {
                job.processed++;
                job.currentStep = "collections";
            }
        }
        log.info("Seed collections committed: {} collections, {} source links", n, links);
        return n;
    }

    /**
     * DOI-less resolution: exact title match in OpenAlex first (live metadata wins),
     * then the sheet's own columns. Null when the row has no usable title.
     */
    private OpenAlexWorkResponse resolveWithoutDoi(Map<String, String> r, String doi) {
        String title = r.getOrDefault("title", "").trim();
        if (!title.isBlank()) {
            try {
                OpenAlexWorkResponse match = openAlexClient.findWorkByTitle(title);
                if (match != null) return match;
            } catch (RuntimeException ignored) {
                // best effort — sheet fallback below
            }
        }
        return sheetWork(r, doi);
    }

    /**
     * Sheet-metadata fallback for DOIs OpenAlex can't resolve (notably arXiv
     * DataCite DOIs). Returns null when the row has no usable title — the caller
     * then keeps the "DOI not resolvable" error instead of saving a stub.
     */
    private static OpenAlexWorkResponse sheetWork(Map<String, String> r, String doi) {
        String title = r.getOrDefault("title", "").trim();
        if (title.isBlank()) return null;
        List<OpenAlexWorkResponse.OpenAlexAuthor> authorships = Arrays.stream(r.getOrDefault("authors", "").split(";"))
                .map(String::trim).filter(s -> !s.isBlank())
                .map(n -> new OpenAlexWorkResponse.OpenAlexAuthor(new OpenAlexWorkResponse.Author(n))).toList();
        String arxivId = arxivId(doi);
        OpenAlexWorkResponse.OpenAlexOpenAccess oa = arxivId == null ? null
                : new OpenAlexWorkResponse.OpenAlexOpenAccess(true, "gold", "https://arxiv.org/pdf/" + arxivId, true);
        String publisher = nullIfBlank(r.getOrDefault("publisher", ""));
        OpenAlexWorkResponse.OpenAlexPrimaryLocation loc = publisher == null ? null
                : new OpenAlexWorkResponse.OpenAlexPrimaryLocation(
                        new OpenAlexWorkResponse.OpenAlexSource(publisher, null, null, null), null, null, null, null, false);
        return new OpenAlexWorkResponse(null, doi, title, authorships, loc, null, oa, null,
                parseInt(r.getOrDefault("publication_year", "")), null, null,
                parseInt(r.getOrDefault("cited_by_count", "")));
    }

    private static String arxivId(String doi) {
        if (doi == null) return null;
        String suffix = doi.contains("/") ? doi.substring(doi.lastIndexOf('/') + 1) : doi;
        // ponytail: DataCite arXiv DOIs look like 10.48550/arXiv.1706.03762
        if (suffix.regionMatches(true, 0, "arXiv.", 0, 6)) return suffix.substring(6).trim();
        if (suffix.regionMatches(true, 0, "arXiv:", 0, 6)) return suffix.substring(6).trim();
        return null;
    }

    private static boolean isDataCiteArxivDoi(String doi) {
        return doi != null && doi.toLowerCase(Locale.ROOT).startsWith("10.48550/arxiv");
    }

    private static boolean hasPdfSignature(byte[] content) {
        if (content == null || content.length < PDF_SIGNATURE.length) return false;
        int scanLength = Math.min(content.length, 1024);
        for (int offset = 0; offset <= scanLength - PDF_SIGNATURE.length; offset++) {
            boolean matches = true;
            for (int index = 0; index < PDF_SIGNATURE.length; index++) {
                if (content[offset + index] != PDF_SIGNATURE[index]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return true;
        }
        return false;
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize to JSON, storing as string", e);
            return String.valueOf(value);
        }
    }

    public int commitPapers(List<Map<String, String>> rows, Map<String, Path> zipFiles, SeedJob job, Map<String, Project> projects) {
        int n = 0;
        for (var r : rows) {
            if (job != null) job.startRows("papers", 1);
            var project = projects.get(r.get("project_title"));
            var uploader = instructorOf(project);
            if (project == null || uploader == null) {
                if (job != null) job.skipped("papers row " + r.get("_row") + ": unresolvable project/member", 1);
                continue;
            }
            String pf = r.getOrDefault("paper_file", "");
            String standard = r.getOrDefault("paper_standard", "").trim().toUpperCase(Locale.ROOT);
            try {
                if (project.getStatus().isReadOnly() || project.getStatus() == ProjectStatus.SUBMITTED_FOR_REVIEW) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is locked for paper changes");
                }
                if (!pf.isBlank() && !zipFiles.isEmpty()) {
                    String norm = pf.replace("\\", "/").replaceAll("^/+", "");
                    Path data = zipFiles.get(norm);
                    if (data == null) {
                        if (job != null) job.skipped("papers row " + r.get("_row") + ": file not in ZIP: " + norm, 1);
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
                    new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                    Document stub = new Document();
                    stub.setProject(projectRepository.findById(project.getId()).orElseThrow());
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
                    });
                } else {
                    String text = r.getOrDefault("content_tex", "");
                    Document d = baseDocument(project, uploader, DocumentType.PAPER,
                            "paper-" + slug(r.getOrDefault("title", project.getTitle())) + ".txt", text);
                    d.setTitle(nullIfBlank(r.getOrDefault("title", "")));
                    new TransactionTemplate(transactionManager).executeWithoutResult(status -> saveText(documentRepository.save(d), text));
                }
                n++;
                if (job != null) job.succeeded("papers", 1);
            } catch (Exception e) {
                if (job != null) job.failed("papers row " + r.get("_row") + ": " + e.getMessage(), 1);
            }
        }
        return n;
    }

    public int commitSections(List<Map<String, String>> rows, SeedJob job, Map<String, Project> projects) {
        int n = 0;
        for (var r : rows) {
            if (job != null) job.startRows("sections", 1);
            var project = projects.get(r.get("project_title"));
            if (project == null) {
                if (job != null) job.skipped("sections row " + r.get("_row") + ": unknown project", 1);
                continue;
            }
            var papers = documentRepository.findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.PAPER);
            if (papers.isEmpty()) {
                if (job != null) job.skipped("sections row " + r.get("_row") + ": project has no paper", 1);
                continue;
            }
            Document paper = papers.get(0);
            if (paper.getProcessingStatus() != ProcessingStatus.READY) {
                if (job != null) job.skipped("sections row " + r.get("_row") + ": PAPER_NOT_READY; apply content after extraction through section APIs/UI", 1);
                continue;
            }
            int order = Integer.parseInt(r.get("section_order"));
            if (paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()).stream()
                    .anyMatch(existing -> existing.getSectionOrder() == order)) {
                if (job != null) job.failed("sections row " + r.get("_row") + ": section order conflicts with a generated/existing section; choose its target via section APIs/UI", 1);
                continue;
            }
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
                job.succeeded("sections", 1);
            }
        }
        return n;
    }

    // ---------- helpers ----------

    /** Only an active Instructor member may own imported papers/sources. */
    private User instructorOf(Project project) {
        if (project == null) return null;
        return new TransactionTemplate(transactionManager).execute(status -> memberRepository.findByProjectId(project.getId()).stream()
                .filter(member -> member.getRole() == ProjectRole.INSTRUCTOR && member.getUser() != null
                        && member.getUser().getRole() == UserRole.INSTRUCTOR && member.getUser().getAccountStatus() == AccountStatus.ACTIVE)
                .map(ProjectMember::getUser).findFirst().orElse(null));
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
