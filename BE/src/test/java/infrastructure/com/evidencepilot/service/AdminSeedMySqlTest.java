package com.evidencepilot.service;

import com.evidencepilot.service.impl.OpenAlexIngestionServiceImpl;
import com.evidencepilot.service.impl.DocumentServiceImpl;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.impl.BlockTreeIngestor;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.service.impl.EvidenceTraceService;
import com.evidencepilot.service.impl.PaperProcessingServiceImpl;
import com.evidencepilot.service.impl.SectionWorkHistoryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect",
        "spring.profiles.active=test", "app.dev-bypass.enabled=true"}, showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import({AdminExcelSeedService.class, PaperProcessingServiceImpl.class, BlockTreeIngestor.class,
        CurrentUserServiceImpl.class, PaperStandardService.class, SectionWorkHistoryService.class,
        com.evidencepilot.service.impl.ProjectCollectionService.class,
        AdminSeedMySqlTest.Config.class})
class AdminSeedMySqlTest {
    @Container static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.46");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }
    @TestConfiguration static class Config {
        @Bean ObjectMapper mapper() { return new ObjectMapper().findAndRegisterModules(); }
    }
    @Autowired AdminExcelSeedService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired com.evidencepilot.repository.ProjectRepository projects;
    @Autowired com.evidencepilot.repository.DocumentRepository documentRows;
    @Autowired com.evidencepilot.repository.EvidenceRevisionTraceRepository traceRows;
    @Autowired com.evidencepilot.repository.AuditLogRepository auditRows;
    @SpyBean PaperSectionRepository sections;
    @SpyBean com.evidencepilot.repository.DocumentTextRepository texts;
    @MockBean AdminService admin;
    @MockBean DocumentServiceImpl documents;
    @MockBean MediaAssetService media;
    @MockBean AiModelClient model;
    @MockBean SystemNotificationService notifications;
    @MockBean TexArchiveBuilder archives;
    @MockBean EvidenceTraceService traces;
    @MockBean AuditService audit;
    @MockBean FeedbackAnchorService anchors;
    @MockBean com.evidencepilot.client.openalex.OpenAlexClient openAlex;
    @MockBean OpenAlexIngestionServiceImpl ingestion;
    @MockBean DocumentObjectStorage storage;
    @MockBean com.evidencepilot.service.impl.DocumentPersistenceService persistence;
    @Autowired com.evidencepilot.service.impl.ProjectCollectionService collections;
    @Autowired com.evidencepilot.repository.CollectionRepository collectionRows;
    @Autowired com.evidencepilot.repository.ProjectCollectionRepository projectCollectionRows;
    @Autowired com.evidencepilot.repository.ProjectDocumentRepository projectDocumentRows;
    @MockBean SeedProjectLifecycle seedProjectLifecycle;
    private User instructor;
    private User actor;

    @BeforeEach void actors() {
        instructor = account(UserRole.INSTRUCTOR);
        actor = account(UserRole.ADMIN);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(actor, null, List.of()));
    }
    @AfterEach void clearActor() { SecurityContextHolder.clearContext(); }

    @Test void standardFailureRollsBackStubAndSectionsButRetainsEarlierProjectAndMembership() throws Exception {
        String title = alias();
        doAnswer(call -> {
            assertThat(((User) SecurityContextHolder.getContext().getAuthentication().getPrincipal()).getId()).isEqualTo(instructor.getId());
            Iterable<PaperSection> rows = call.getArgument(0);
            for (PaperSection row : rows) sections.saveAndFlush(row);
            throw new IllegalStateException("Injected section persistence failure");
        }).when(sections).saveAll(any());
        var job = run(bundle(title, "IEEE", false));
        org.mockito.Mockito.verify(sections).saveAll(any());
        assertThat(job.getErrors()).anyMatch(error -> error.contains("Injected section persistence failure"));
        assertThat(job.getStatus()).isEqualTo("PARTIAL");
        assertThat(job.getSuccessfulRows()).isEqualTo(2);
        assertThat(job.getFailedRows()).isOne();
        assertThat(job.getProcessed()).isEqualTo(3);
        assertThat(count("SELECT COUNT(*) FROM projects WHERE title=?", title)).isOne();
        assertThat(count("SELECT COUNT(*) FROM project_members m JOIN projects p ON p.id=m.project_id WHERE p.title=?", title)).isOne();
        assertThat(count("SELECT COUNT(*) FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.title=?", title)).isZero();
        assertThat(count("SELECT COUNT(*) FROM paper_sections s JOIN documents d ON d.id=s.document_id JOIN projects p ON p.id=d.project_id WHERE p.title=?", title)).isZero();
        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal()).isSameAs(actor);
    }

    @Test void standardSuccessCreatesRealSectionsAndReimportLeavesThemUntouched() throws Exception {
        String title = alias();
        byte[] workbook = bundle(title, "IEEE", false);
        var job = run(workbook);
        assertThat(job.getStatus()).isEqualTo("DONE");
        assertThat(job.getSuccessfulRows()).isEqualTo(3);
        int sectionCount = count("SELECT COUNT(*) FROM paper_sections s JOIN documents d ON d.id=s.document_id JOIN projects p ON p.id=d.project_id WHERE p.title=?", title);
        assertThat(sectionCount).isGreaterThan(2);
        assertThat(count("SELECT COUNT(*) FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.title=? AND d.processing_status='READY'", title)).isOne();
        assertThat(service.tryReserveImport()).isTrue();
        try {
            assertThatThrownBy(() -> service.submit(workbook, null, null))
                    .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                            ex -> assertThat(ex.getStatusCode().value()).isEqualTo(409));
        } finally { service.releaseImport(); }
        assertThat(count("SELECT COUNT(*) FROM projects WHERE title=?", title)).isOne();
        assertThat(count("SELECT COUNT(*) FROM paper_sections s JOIN documents d ON d.id=s.document_id JOIN projects p ON p.id=d.project_id WHERE p.title=?", title)).isEqualTo(sectionCount);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal()).isSameAs(actor);
    }

    @Test void sectionsSheetIsCommittedWithoutOverwrite() throws Exception {
        String title = alias();
        var job = run(bundle(title, "ACM", true));
        assertThat(job.getStatus()).isEqualTo("DONE");
        assertThat(job.getResult().get("sections")).isOne();
        assertThat(count("SELECT COUNT(*) FROM paper_sections s JOIN documents d ON d.id=s.document_id JOIN projects p ON p.id=d.project_id WHERE p.title=? AND s.content_tex='MUST NOT OVERWRITE'", title)).isOne();
        assertThat(count("SELECT COUNT(*) FROM paper_sections s JOIN documents d ON d.id=s.document_id JOIN projects p ON p.id=d.project_id WHERE p.title=? AND s.section_title='Overwritten'", title)).isOne();
        assertThat(count("SELECT COUNT(*) FROM paper_sections s JOIN documents d ON d.id=s.document_id JOIN projects p ON p.id=d.project_id WHERE p.title=?", title)).isGreaterThan(1);
    }

    @Test void inlinePaperTextFailureRollsBackDocumentTextAndChunks() throws Exception {
        String title = alias();
        doThrow(new IllegalStateException("Injected text failure")).when(texts).save(any());
        byte[] workbook = workbook(Map.of(
                "projects", new String[][]{{"project_title"}, {title}},
                "members", members(title),
                "papers", new String[][]{{"project_title", "title", "content_tex"}, {title, "Synthetic paper", "Synthetic content"}}));
        var job = run(workbook);
        assertThat(job.getStatus()).isEqualTo("PARTIAL");
        assertThat(job.getSuccessfulRows()).isEqualTo(2);
        assertThat(job.getFailedRows()).isOne();
        org.mockito.Mockito.verify(texts).save(any());
        assertThat(job.getErrors()).anyMatch(error -> error.contains("Injected text failure"));
        assertThat(count("SELECT COUNT(*) FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.title=?", title)).isZero();
    }

    @Test void doiSourcePersistsMetadataAndCountsTheImportedRow() throws Exception {
        String title = alias();
        var work = new com.evidencepilot.dto.openalex.OpenAlexWorkResponse(
                "https://openalex.org/W1", "10.1000/synthetic-source", "Synthetic source",
                List.of(), null, null, null, null, 2026, null, null, 0);
        org.mockito.Mockito.when(openAlex.fetchWork("10.1000/synthetic-source")).thenReturn(work);
        var job = run(workbook(Map.of(
                "projects", new String[][]{{"project_title"}, {title}},
                "members", members(title),
                "sources", new String[][]{{"project_title", "doi"}, {title, "10.1000/synthetic-source"}})));
        assertThat(job.getStatus()).isEqualTo("DONE");
        assertThat(job.getSuccessfulRows()).isEqualTo(3);
        assertThat(job.getResult().get("sources")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.title=? AND d.doc_type='SOURCE' AND d.doi='10.1000/synthetic-source' AND d.processing_status='METADATA_FETCHED'", title)).isOne();
        org.mockito.Mockito.verify(openAlex, org.mockito.Mockito.never()).downloadPdf(any());
    }

    @Test void v2WaitsForReadyPaperAndInvokesRealLifecycleTarget() throws Exception {
        User leader = account(UserRole.STUDENT);
        String title = alias();
        String collectionTitle = "C-" + title;
        String sourceDoi = "10.1234/seed-collection";
        String paperPath = "papers/seed-paper/seed-paper.tex";
        byte[] workbook = workbook(Map.of(
                "README", new String[][]{{"seed_format_version", "2"}},
                "users", new String[][]{{"email", "first_name", "last_name", "role", "student_code", "send_invitation"}},
                "projects", new String[][]{{"project_title", "status"}, {title, "SUBMITTED_FOR_REVIEW"}},
                "members", new String[][]{{"project_title", "user_email", "project_role"},
                        {title, instructor.getEmail(), "INSTRUCTOR"},
                        {title, leader.getEmail(), "LEADER"}},
                "sources", new String[][]{{"project_title", "doi"}, {title, sourceDoi}},
                "papers", new String[][]{{"project_title", "paper_file"}, {title, paperPath}},
                "collections", new String[][]{{"collection_title", "description", "owner_email", "source_dois"},
                        {collectionTitle, "fixture", instructor.getEmail(), sourceDoi}},
                "project_collections", new String[][]{{"project_title", "collection_title"},
                        {title, collectionTitle}}));
        java.nio.file.Path paperFile = java.nio.file.Files.createTempFile("seed-paper-test-", ".tex");
        java.nio.file.Files.writeString(paperFile, "\\section{Introduction} Content.");
        try {
            org.mockito.Mockito.when(openAlex.fetchWork(sourceDoi)).thenReturn(
                    new com.evidencepilot.dto.openalex.OpenAlexWorkResponse(
                            "https://openalex.org/seed-collection", sourceDoi,
                            "Seed source", List.of(), null, null, null, null,
                            2026, null, null, 0));
            org.mockito.Mockito.when(documents.uploadDocument(any(UUID.class), any(org.springframework.web.multipart.MultipartFile.class),
                    org.mockito.ArgumentMatchers.eq(com.evidencepilot.model.enums.DocumentType.PAPER)))
                    .thenAnswer(call -> {
                        UUID projectId = call.getArgument(0);
                        String documentId = UUID.randomUUID().toString();
                        jdbc.update("INSERT INTO documents(id,project_id,uploaded_by,doc_type,file_url,processing_status,active,download_token) "
                                        + "VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),'PAPER','fixture.tex','READY',TRUE,UUID())",
                                documentId, projectId.toString(), instructor.getId().toString());
                        var response = mock(com.evidencepilot.dto.response.DocumentResponse.class);
                        org.mockito.Mockito.when(response.id()).thenReturn(UUID.fromString(documentId));
                        return response;
                    });
            var job = run(workbook, new AdminExcelSeedService.ZipBundle(Map.of(paperPath, paperFile), List.of()));
            assertThat(job.getStatus()).isEqualTo("DONE");
            assertThat(job.getResult().get("review_states")).isEqualTo(1);
            assertThat(job.getResult().get("project_collections")).isEqualTo(1);
            UUID projectId = projects.findAll().stream().filter(p -> title.equals(p.getTitle()))
                    .findFirst().orElseThrow().getId();
            assertThat(projectCollectionRows.findByProjectId(projectId)).hasSize(1);
            assertThat(projectDocumentRows.findByProjectId(projectId)).hasSize(1);
            org.mockito.Mockito.verify(seedProjectLifecycle).apply(projectId,
                    com.evidencepilot.model.enums.ProjectStatus.SUBMITTED_FOR_REVIEW, actor);
        } finally {
            java.nio.file.Files.deleteIfExists(paperFile);
        }
    }

    @Test void v2PersistsSixtyDoiOnlySourcesWithoutOpenAlexMetadata() {
        String title = alias();
        var project = new com.evidencepilot.model.Project();
        project.setTitle(title);
        project.setStatus(com.evidencepilot.model.enums.ProjectStatus.IN_PROGRESS);
        project.setActive(true);
        project = projects.saveAndFlush(project);
        jdbc.update("INSERT INTO project_members(id,project_id,user_id,role) "
                        + "VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),'INSTRUCTOR')",
                UUID.randomUUID().toString(), project.getId().toString(), instructor.getId().toString());
        org.mockito.Mockito.when(openAlex.fetchWork(org.mockito.ArgumentMatchers.anyString())).thenAnswer(call -> new com.evidencepilot.dto.openalex.OpenAlexWorkResponse(
                "https://openalex.org/" + call.getArgument(0), call.getArgument(0),
                "Seed source " + call.getArgument(0), List.of(), null, null, null, null,
                2026, null, null, 0));
        List<Map<String, String>> rows = new java.util.ArrayList<>();
        for (int index = 1; index <= 60; index++) {
            rows.add(Map.of("project_title", title, "doi", "10.1234/seed-" + index,
                    "_row", String.valueOf(index + 1)));
        }
        Map<String, com.evidencepilot.model.Document> imported = new java.util.LinkedHashMap<>();
        var job = new AdminExcelSeedService.SeedJob();

        int count = service.commitSourcesV2(rows, job, Map.of(title, project), imported);

        assertThat(count).isEqualTo(60);
        assertThat(imported).hasSize(60);
        assertThat(count("SELECT COUNT(*) FROM documents d WHERE d.project_id=UUID_TO_BIN(?) "
                + "AND d.doc_type='SOURCE' AND d.processing_status='METADATA_FETCHED'",
                project.getId().toString())).isEqualTo(60);
    }

    @Test void seedCollectionLinkPersistsProjectCollectionAndDerivedDocument() {
        String title = alias();
        var project = new com.evidencepilot.model.Project();
        project.setTitle(title);
        project.setStatus(com.evidencepilot.model.enums.ProjectStatus.IN_PROGRESS);
        project.setActive(true);
        project = projects.saveAndFlush(project);
        jdbc.update("INSERT INTO project_members(id,project_id,user_id,role) "
                        + "VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),'INSTRUCTOR')",
                UUID.randomUUID().toString(), project.getId().toString(), instructor.getId().toString());

        var source = new com.evidencepilot.model.Document();
        source.setProject(project);
        source.setUploadedBy(instructor);
        source.setDocType(com.evidencepilot.model.enums.DocumentType.SOURCE);
        source.setDoi("10.1234/collection-source");
        source.setOriginalFilename("source.pdf");
        source.setFileUrl("sources/source.pdf");
        source.setProcessingStatus(com.evidencepilot.model.enums.ProcessingStatus.METADATA_FETCHED);
        source.setContentType("application/pdf");
        source.setFileSizeBytes(0L);
        source.setActive(true);
        source.setDownloadToken(UUID.randomUUID().toString());
        source = documentRows.saveAndFlush(source);

        var collection = collections.createSeedCollection(instructor, "C-" + title, "fixture");
        collections.addSource(source, collection, instructor);
        collections.link(project.getId(), collection.getId());

        assertThat(projectCollectionRows.findByProjectId(project.getId())).hasSize(1);
        assertThat(projectDocumentRows.findByProjectId(project.getId())).hasSize(1);
    }

    @Test void missingMemberAndSubmittedStateRejectBeforeWrites() throws Exception {
        for (byte[] workbook : List.of(
                workbook(Map.of("projects", new String[][]{{"project_title"}, {alias()}}, "members",
                        new String[][]{{"project_title", "user_email", "project_role"}, {"UNKNOWN", "absent@fixture.test", "INSTRUCTOR"}})),
                workbook(Map.of("projects", new String[][]{{"project_title", "status"}, {alias(), "SUBMITTED_FOR_REVIEW"}})))) {
            int before = count("SELECT COUNT(*) FROM projects");
            assertThat(service.tryReserveImport()).isTrue();
            try {
                assertThatThrownBy(() -> service.submit(workbook, null, null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
            } finally { service.releaseImport(); }
            assertThat(count("SELECT COUNT(*) FROM projects")).isEqualTo(before);
        }
    }

    @Test void csvScopesEveryTableWithoutLazyReadsAndExportsMoreThanOnePage() throws Exception {
        String projectA = UUID.randomUUID().toString(), projectB = UUID.randomUUID().toString();
        String documentA = UUID.randomUUID().toString(), documentB = UUID.randomUUID().toString(), orphan = UUID.randomUUID().toString();
        for (String project : List.of(projectA, projectB)) {
            jdbc.update("INSERT INTO projects(id,title,status,active) VALUES(UUID_TO_BIN(?),?,'IN_PROGRESS',TRUE)",
                    project, project.equals(projectA) ? "Đề tài, \"A\"\nDòng hai" : "UNRELATED_EXPORT_FIXTURE");
        }
        jdbc.update("INSERT INTO project_members(id,project_id,user_id,role) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),'INSTRUCTOR')",
                UUID.randomUUID().toString(), projectA, instructor.getId().toString());
        for (String document : List.of(documentA, documentB, orphan)) {
            jdbc.update("INSERT INTO documents(id,project_id,uploaded_by,doc_type,file_url,original_filename,processing_status,active,download_token) "
                            + "VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),'PAPER','fixture',?,'READY',TRUE,?)",
                    document, document.equals(orphan) ? null : document.equals(documentA) ? projectA : projectB, instructor.getId().toString(),
                    document.equals(documentA) ? "paper,\"A\".tex" : "UNRELATED_EXPORT_FIXTURE", "SENSITIVE_EXPORT_FIXTURE");
        }
        String firstSection = null;
        for (int i = 0; i < 505; i++) {
            String id = UUID.randomUUID().toString();
            if (i == 0) firstSection = id;
            jdbc.update("INSERT INTO paper_sections(id,document_id,section_title,section_order,content_tex,active,version) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),?,?,?,TRUE,1)",
                    id, documentA, i == 0 ? "  =SUM(1,2)" : "Section " + i, i, "Fixture content");
        }
        jdbc.update("INSERT INTO paper_sections(id,document_id,section_title,section_order,content_tex,active,version) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),'UNRELATED_EXPORT_FIXTURE',0,'fixture',TRUE,1)",
                UUID.randomUUID().toString(), documentB);
        String roundA = UUID.randomUUID().toString(), roundB = UUID.randomUUID().toString();
        for (String round : List.of(roundA, roundB)) {
            jdbc.update("INSERT INTO citation_review_rounds(id,project_id,section_id,section_version,requested_by,content_fingerprint,style,complete) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),1,UUID_TO_BIN(?),?,'SECTION',TRUE)",
                    round, round.equals(roundA) ? projectA : projectB, firstSection, instructor.getId().toString(), "f".repeat(64));
            jdbc.update("INSERT INTO evidence_revision_traces(id,round_id,section_id,finding_index,suggested_action,excerpt,excerpt_start,excerpt_end,rationale) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),0,'ADD_CITATION','fixture',0,7,'fixture')",
                    UUID.randomUUID().toString(), round, firstSection);
        }
        for (var entity : List.of(new String[]{"PROJECT", projectA}, new String[]{"DOCUMENT", documentA}, new String[]{"PaperSection", firstSection}, new String[]{"PROJECT", projectB})) {
            jdbc.update("INSERT INTO audit_logs(id,actor_id,action,severity,entity_type,entity_id,occurred_at) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),?,'INFO',?,UUID_TO_BIN(?),NOW())",
                    UUID.randomUUID().toString(), instructor.getId().toString(), entity[1].equals(projectB) ? "UNRELATED_EXPORT_FIXTURE" : "FIXTURE", entity[0], entity[1]);
        }
        var export = new com.evidencepilot.controller.AdminBackupController(users, projects, documentRows, sections,
                traceRows, auditRows, mock(AdminSeedExportService.class), mock(DocumentObjectStorage.class));
        var output = new ByteArrayOutputStream();
        export.backupCsv(UUID.fromString(projectA)).getBody().writeTo(output);
        String csv = output.toString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(csv).doesNotContain("UNRELATED_EXPORT_FIXTURE", "SENSITIVE_EXPORT_FIXTURE", actor.getEmail(), projectB, documentB, orphan);
        assertThat(csv.lines().filter(line -> line.startsWith("\"paper_sections\"")).count()).isEqualTo(505);
        assertThat(csv.lines().filter(line -> line.startsWith("\"users\"")).count()).isOne();
        assertThat(csv.lines().filter(line -> line.startsWith("\"evidence_traces\"")).count()).isOne();
        assertThat(csv.lines().filter(line -> line.startsWith("\"audit_logs\"")).count()).isEqualTo(3);
        java.nio.file.Files.write(java.nio.file.Path.of("target/admin-export-fixture.csv"), output.toByteArray());
    }

    private byte[] bundle(String title, String standard, boolean collision) throws Exception {
        Map<String, String[][]> data = new java.util.LinkedHashMap<>();
        data.put("projects", new String[][]{{"project_title", "status"}, {title, "IN_PROGRESS"}});
        data.put("members", members(title));
        data.put("papers", new String[][]{{"project_title", "paper_standard"}, {title, standard}});
        if (collision) data.put("sections", new String[][]{{"project_title", "section_title", "section_order", "content_tex"},
                {title, "Overwritten", "0", "MUST NOT OVERWRITE"}});
        return workbook(data);
    }
    private String[][] members(String title) {
        return new String[][]{{"project_title", "user_email", "project_role"}, {title, instructor.getEmail(), "INSTRUCTOR"}};
    }
    private static byte[] workbook(Map<String, String[][]> data) throws Exception {
        try (var workbook = new XSSFWorkbook(); var out = new ByteArrayOutputStream()) {
            data.forEach((name, rows) -> {
                var sheet = workbook.createSheet(name);
                for (int r = 0; r < rows.length; r++) {
                    var row = sheet.createRow(r);
                    for (int c = 0; c < rows[r].length; c++) row.createCell(c).setCellValue(rows[r][c]);
                }
            });
            workbook.write(out);
            return out.toByteArray();
        }
    }
    private AdminExcelSeedService.SeedJob run(byte[] workbook) throws Exception {
        return run(workbook, null);
    }
    private AdminExcelSeedService.SeedJob run(byte[] workbook, AdminExcelSeedService.ZipBundle bundle) throws Exception {
        assertThat(service.tryReserveImport()).isTrue();
        AdminExcelSeedService.SeedJob job;
        try { job = service.submit(workbook, bundle, null); }
        catch (Exception ex) { service.releaseImport(); throw ex; }
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(20);
        while (System.nanoTime() < deadline) {
            if (!List.of("RUNNING", "QUEUED").contains(job.getStatus()) && service.tryReserveImport()) {
                service.releaseImport();
                assertThat(job.getProcessed()).isEqualTo(job.getSuccessfulRows() + job.getFailedRows() + job.getSkippedRows());
                return job;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("Seed job timeout");
    }
    private User account(UserRole role) {
        var user = new User();
        user.setEmail(UUID.randomUUID() + "@fixture.test");
        user.setPasswordHash(User.DISABLED_PASSWORD_SENTINEL);
        user.setRole(role);
        user.setAccountStatus(AccountStatus.ACTIVE);
        return users.saveAndFlush(user);
    }
    private int count(String sql, Object... args) { return jdbc.queryForObject(sql, Integer.class, args); }
    private static String alias() { return "HANDOFF-" + UUID.randomUUID(); }
}
