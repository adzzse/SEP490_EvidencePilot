package com.evidencepilot.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminExcelSeedServiceTest {

    @TempDir java.nio.file.Path temp;

    private AdminExcelSeedService service() {
        return new AdminExcelSeedService(
                mock(AdminService.class),
                mock(com.evidencepilot.repository.UserRepository.class),
                mock(com.evidencepilot.repository.ProjectRepository.class),
                mock(com.evidencepilot.repository.ProjectMemberRepository.class),
                mock(com.evidencepilot.repository.DocumentRepository.class),
                mock(com.evidencepilot.repository.DocumentTextRepository.class),
                mock(com.evidencepilot.repository.DocumentChunkRepository.class),
                mock(com.evidencepilot.repository.PaperSectionRepository.class),
                mock(DocumentService.class),
                mock(MediaAssetService.class),
                mock(PaperProcessingService.class),
                mock(com.evidencepilot.client.openalex.OpenAlexClient.class),
                mock(OpenAlexIngestionService.class),
                mock(DocumentObjectStorage.class),
                mock(com.evidencepilot.service.impl.DocumentPersistenceService.class),
                mock(com.evidencepilot.service.impl.ProjectCollectionService.class),
                mock(com.fasterxml.jackson.databind.ObjectMapper.class), localPolicy(), mock(org.springframework.transaction.PlatformTransactionManager.class));
    }

    private static DevBypassPolicy localPolicy() {
        return new DevBypassPolicy(true, new org.springframework.mock.env.MockEnvironment()
                .withProperty("spring.profiles.active", "test"));
    }

    @Test
    void forbiddenMixedInvitationBatchFailsBeforeAnyImport() {
        var service = service();
        var policy = new DevBypassPolicy(true, new org.springframework.mock.env.MockEnvironment()
                .withProperty("APP_ENV", "production").withProperty("spring.profiles.active", "dev"));
        org.springframework.test.util.ReflectionTestUtils.setField(service, "seedPolicy", policy);
        var rows = List.of(
                row("email", "invited@fixture.test", "role", "INSTRUCTOR", "send_invitation", "TRUE"),
                row("email", "silent@fixture.test", "role", "INSTRUCTOR", "send_invitation", ""));
        assertThat(service.validate(Map.of("users", rows))).anyMatch(error -> error.contains("Silent seed"));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.commitUsers(rows, null))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        org.mockito.Mockito.verifyNoInteractions(org.springframework.test.util.ReflectionTestUtils.getField(service, "adminService"));
    }

    private static Map<String, String> row(Object... kv) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], (String) kv[i + 1]);
        return m;
    }

    private static Map<String, java.nio.file.Path> zip(String... names) {
        Map<String, java.nio.file.Path> m = new HashMap<>();
        // checkZipLayout only inspects keys - values are never read
        for (String n : names) m.put(n, java.nio.file.Path.of(n));
        return m;
    }

    @Test
    void templateBundleIsSeedPlusPaperFoldersOnly() throws Exception {
        byte[] bundle = service().buildTemplateBundle();
        List<String> names = new ArrayList<>();
        try (ZipInputStream zip = new ZipInputStream(new java.io.ByteArrayInputStream(bundle))) {
            java.util.zip.ZipEntry e;
            while ((e = zip.getNextEntry()) != null) names.add(e.getName());
        }
        assertThat(names).containsExactlyInAnyOrder(
                "seed.xlsx",
                "papers/attention-retrieval/attention-retrieval.tex",
                "papers/attention-retrieval/README.md",
                "papers/attention-retrieval/images/README.txt");
    }

    @Test
    void templatePaperExampleMatchesBundleLayout() throws Exception {
        // the xlsx example row must point at a path the bundle actually ships
        byte[] bundle = service().buildTemplateBundle();
        Map<String, byte[]> files = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new java.io.ByteArrayInputStream(bundle))) {
            java.util.zip.ZipEntry e;
            while ((e = zip.getNextEntry()) != null) {
                files.put(e.getName(), zip.readAllBytes());
            }
        }
        try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(
                new java.io.ByteArrayInputStream(files.get("seed.xlsx")))) {
            var sheet = wb.getSheet("papers");
            String paperFile = sheet.getRow(1).getCell(2).toString();
            assertThat(files).containsKey(paperFile);
        }
    }

    @Test
    void paperFolderMustEqualPaperFileSlug() {
        var sheets = Map.of("papers", List.of(row(
                "project_title", "P", "paper_folder", "my-slug",
                "paper_file", "papers/other-slug/paper.pdf", "content_tex", "", "_row", "2")));
        assertThat(service().validate(sheets))
                .anyMatch(m -> m.contains("paper_folder must equal the folder in paper_file"));
    }

    @Test
    void paperTxtSurfacesRenameHint() {
        var sheets = Map.of("papers", List.of(row(
                "project_title", "P", "paper_folder", "s",
                "paper_file", "papers/s/s.txt", "content_tex", "", "_row", "2")));
        var errors = service().checkZipLayout(sheets, zip("papers/s/s.txt"));
        assertThat(errors).anyMatch(m -> m.contains("must be named s.{pdf,docx,tex}"));
    }

    @Test
    void unsupportedExtensionSurfacesValidateFileWording() {
        var sheets = Map.of("papers", List.of(row(
                "project_title", "P", "paper_folder", "s",
                "paper_file", "papers/s/s.xyz", "content_tex", "", "_row", "2")));
        var errors = service().checkZipLayout(sheets, zip("papers/s/s.xyz"));
        assertThat(errors).anyMatch(m -> m.contains("Only PDF, DOCX, and LaTeX"));
    }

    @Test
    void templateReadmePlaceholderPassesZipCheck() {
        var sheets = Map.of("papers", List.of(row(
                "project_title", "P", "paper_folder", "s",
                "paper_file", "papers/s/s.tex", "content_tex", "", "_row", "2")));
        var zip = zip(
                "seed.xlsx",
                "papers/s/s.tex",
                "papers/s/images/README.txt");
        assertThat(service().checkZipLayout(sheets, zip)).isEmpty();
    }

    @Test
    void nonImageUnderImagesIsRejectedAtPreview() {
        var sheets = Map.of("papers", List.of(row(
                "project_title", "P", "paper_folder", "s",
                "paper_file", "papers/s/s.tex", "content_tex", "", "_row", "2")));
        var zip = zip(
                "papers/s/s.tex",
                "papers/s/images/notes.bmp");
        assertThat(service().checkZipLayout(sheets, zip))
                .anyMatch(m -> m.contains("only png/jpg/jpeg/gif/pdf allowed under images/"));
    }

    @Test
    void howToAddOnlyFolderGetsPaywalledMessage() {
        var sheets = Map.of("papers", List.of(row(
                "project_title", "P", "paper_folder", "s",
                "paper_file", "papers/s/s.pdf", "content_tex", "", "_row", "2")));
        var zip = zip("papers/s/HOW-TO-ADD.txt");
        assertThat(service().checkZipLayout(sheets, zip))
                .anyMatch(m -> m.contains("holds only HOW-TO-ADD.txt (paywalled source)"));
    }

    @Test
    void missingOrEmptyFolderGetsActionableMessage() {
        var sheets = Map.of("papers", List.of(row(
                "project_title", "P", "paper_folder", "s",
                "paper_file", "papers/s/s.pdf", "content_tex", "", "_row", "2")));
        assertThat(service().checkZipLayout(sheets, zip("seed.xlsx")))
                .anyMatch(m -> m.contains("is missing or empty in the ZIP"));
    }

    @Test
    void readZipSpoolsToDiskWithNoSizeCap() throws Exception {
        byte[] raw;
        try (var out = new java.io.ByteArrayOutputStream();
                var zip = new java.util.zip.ZipOutputStream(out)) {
            zip.putNextEntry(new java.util.zip.ZipEntry("seed.xlsx"));
            zip.write(new byte[]{1, 2, 3});
            zip.closeEntry();
            zip.putNextEntry(new java.util.zip.ZipEntry("papers/s/paper.pdf"));
            zip.write(new byte[]{4, 5, 6, 7});
            zip.closeEntry();
            zip.finish();
            raw = out.toByteArray();
        }
        var bundle = service().readZip(new java.io.ByteArrayInputStream(raw));
        try {
            assertThat(bundle.errors()).isEmpty();
            assertThat(bundle.files().keySet())
                    .containsExactlyInAnyOrder("seed.xlsx", "papers/s/paper.pdf");
            assertThat(java.nio.file.Files.readAllBytes(bundle.files().get("papers/s/paper.pdf")))
                    .containsExactly(4, 5, 6, 7);
            assertThat(bundle.spoolDir()).isNotNull();
        } finally {
            AdminExcelSeedService.deleteSpoolDir(bundle.spoolDir());
        }
    }

    @Test
    void standardOnlyRowPassesValidation() {
        var sheets = Map.of(
                "projects", List.of(row("project_title", "P", "_row", "2")),
                "papers", List.of(row("project_title", "P", "paper_folder", "s", "paper_file", "",
                        "title", "", "content_tex", "", "paper_standard", "IEEE", "_row", "2")));
        assertThat(service().validate(sheets)).isEmpty();
    }

    @Test
    void unknownStandardIsRejected() {
        var sheets = Map.of(
                "projects", List.of(row("project_title", "P", "_row", "2")),
                "papers", List.of(row("project_title", "P", "paper_folder", "s", "paper_file", "",
                        "title", "", "content_tex", "", "paper_standard", "BOGUS", "_row", "2")));
        assertThat(service().validate(sheets))
                .anyMatch(m -> m.contains("unknown paper_standard"));
    }

    @Test
    void standardRowNeedsNoZipFile() {
        var sheets = Map.of("papers", List.of(row(
                "project_title", "P", "paper_folder", "s", "paper_file", "",
                "title", "", "content_tex", "", "paper_standard", "ACM", "_row", "2")));
        assertThat(service().checkZipLayout(sheets, Map.of())).isEmpty();
    }

    @Test
    void commitPapersStandardBranchBuildsStubAsInstructor() {
        var users = mock(com.evidencepilot.repository.UserRepository.class);
        var projects = mock(com.evidencepilot.repository.ProjectRepository.class);
        var members = mock(com.evidencepilot.repository.ProjectMemberRepository.class);
        var documents = mock(com.evidencepilot.repository.DocumentRepository.class);
        var papers = mock(PaperProcessingService.class);
        var tx = mock(org.springframework.transaction.PlatformTransactionManager.class);
        var service = new AdminExcelSeedService(
                mock(AdminService.class), users, projects, members, documents,
                mock(com.evidencepilot.repository.DocumentTextRepository.class),
                mock(com.evidencepilot.repository.DocumentChunkRepository.class),
                mock(com.evidencepilot.repository.PaperSectionRepository.class),
                mock(DocumentService.class), mock(MediaAssetService.class), papers,
                mock(com.evidencepilot.client.openalex.OpenAlexClient.class),
                mock(OpenAlexIngestionService.class),
                mock(DocumentObjectStorage.class),
                mock(com.evidencepilot.service.impl.DocumentPersistenceService.class),
                mock(com.evidencepilot.service.impl.ProjectCollectionService.class),
                mock(com.fasterxml.jackson.databind.ObjectMapper.class), localPolicy(), tx);
        when(tx.getTransaction(any())).thenReturn(new org.springframework.transaction.support.SimpleTransactionStatus());
        var projectId = java.util.UUID.randomUUID();
        var project = new com.evidencepilot.model.Project();
        project.setId(projectId);
        project.setTitle("P");
        project.setStatus(com.evidencepilot.model.enums.ProjectStatus.IN_PROGRESS);

        var instructorId = java.util.UUID.randomUUID();
        var instructor = new com.evidencepilot.model.User();
        instructor.setId(instructorId);
        instructor.setRole(com.evidencepilot.model.enums.UserRole.INSTRUCTOR);
        instructor.setAccountStatus(com.evidencepilot.model.enums.AccountStatus.ACTIVE);
        var membership = new com.evidencepilot.model.ProjectMember();
        membership.setRole(com.evidencepilot.model.enums.ProjectRole.INSTRUCTOR);
        membership.setUser(instructor);
        when(members.findByProjectId(projectId)).thenReturn(List.of(membership));
        when(projects.findById(projectId)).thenReturn(java.util.Optional.of(project));

        when(documents.save(any())).thenAnswer(inv -> {
            var doc = (com.evidencepilot.model.Document) inv.getArgument(0);
            doc.setId(java.util.UUID.randomUUID());
            return doc;
        });
        when(papers.createSectionsFromStandard(any(), eq("IEEE"))).thenReturn(List.of());
        var rows = List.of(row("project_title", "P", "paper_folder", "s", "paper_file", "",
                "title", "", "content_tex", "", "paper_standard", "IEEE", "_row", "2"));
        int n = service.commitPapers(rows, Map.of(), null, Map.of("P", project));

        assertThat(n).isEqualTo(1);
        verify(papers).createSectionsFromStandard(any(), eq("IEEE"));
        var stub = org.mockito.ArgumentCaptor.forClass(com.evidencepilot.model.Document.class);
        verify(documents).save(stub.capture());
        assertThat(stub.getValue().getOriginalFilename()).isEqualTo("_standard_IEEE.tex");
        assertThat(stub.getValue().getUploadedBy().getId()).isEqualTo(instructorId);
        // caller auth restored after the instructor switch
        assertThat(org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication()).isNull();
    }

    @Test
    void sendInvitationFlagTruthTable() {
        assertThat(AdminExcelSeedService.sendInvitationRequested(null)).isFalse();
        assertThat(AdminExcelSeedService.sendInvitationRequested("")).isFalse();
        assertThat(AdminExcelSeedService.sendInvitationRequested("  ")).isFalse();
        assertThat(AdminExcelSeedService.sendInvitationRequested("FALSE")).isFalse();
        assertThat(AdminExcelSeedService.sendInvitationRequested("0")).isFalse();
        assertThat(AdminExcelSeedService.sendInvitationRequested("no")).isFalse();
        assertThat(AdminExcelSeedService.sendInvitationRequested("TRUE")).isTrue();
        assertThat(AdminExcelSeedService.sendInvitationRequested(" true ")).isTrue();
        assertThat(AdminExcelSeedService.sendInvitationRequested("1")).isTrue();
        assertThat(AdminExcelSeedService.sendInvitationRequested("YES")).isTrue();
    }

    @Test
    void sendInvitationGarbageIsRejected() {
        var sheets = Map.of("users", List.of(row("email", "a@example.com", "first_name", "A",
                "last_name", "B", "role", "STUDENT", "student_code", "SE170001",
                "send_invitation", "maybe", "_row", "2")));
        assertThat(service().validate(sheets))
                .anyMatch(m -> m.contains("send_invitation must be TRUE or FALSE"));
    }

    @Test
    void commitUsersPartitionsInviteAndSilentGroups() {
        var adminService = mock(AdminService.class);
        var service = new AdminExcelSeedService(
                adminService,
                mock(com.evidencepilot.repository.UserRepository.class),
                mock(com.evidencepilot.repository.ProjectRepository.class),
                mock(com.evidencepilot.repository.ProjectMemberRepository.class),
                mock(com.evidencepilot.repository.DocumentRepository.class),
                mock(com.evidencepilot.repository.DocumentTextRepository.class),
                mock(com.evidencepilot.repository.DocumentChunkRepository.class),
                mock(com.evidencepilot.repository.PaperSectionRepository.class),
                mock(DocumentService.class),
                mock(MediaAssetService.class),
                mock(PaperProcessingService.class),
                mock(com.evidencepilot.client.openalex.OpenAlexClient.class),
                mock(OpenAlexIngestionService.class),
                mock(DocumentObjectStorage.class),
                mock(com.evidencepilot.service.impl.DocumentPersistenceService.class),
                mock(com.evidencepilot.service.impl.ProjectCollectionService.class),
                mock(com.fasterxml.jackson.databind.ObjectMapper.class), localPolicy(), mock(org.springframework.transaction.PlatformTransactionManager.class));
        when(adminService.importUsers(any(), anyBoolean())).thenAnswer(inv -> {
            @SuppressWarnings("unchecked")
            List<com.evidencepilot.dto.request.AdminUserImportRequest.UserItem> items =
                    ((com.evidencepilot.dto.request.AdminUserImportRequest) inv.getArgument(0)).users();
            return new com.evidencepilot.dto.response.AdminUserImportResponse(items.size(), 0, List.of());
        });
        var rows = List.of(
                row("email", "a@example.com", "first_name", "A", "last_name", "A",
                        "role", "STUDENT", "student_code", "SE170001", "send_invitation", "TRUE", "_row", "2"),
                row("email", "b@example.com", "first_name", "B", "last_name", "B",
                        "role", "STUDENT", "student_code", "SE170002", "send_invitation", "", "_row", "3"),
                row("email", "c@example.com", "first_name", "C", "last_name", "C",
                        "role", "INSTRUCTOR", "student_code", "", "send_invitation", "FALSE", "_row", "4"));

        int n = service.commitUsers(rows, null);

        assertThat(n).isEqualTo(3);
        // invite group goes through the default path, silent groups suppress mail
        verify(adminService).importUsers(any(), eq(false));
        verify(adminService, times(2)).importUsers(any(), eq(true));
    }

    @ParameterizedTest
    @ValueSource(strings = {"../outside", "dir/../outside", "dir\\..\\outside", "/absolute", "C:/absolute", "//host/share",
            "name:stream", "name. ", "name.", "CON.txt", "dir/NUL"})
    void illegalZipPathsAreRejectedAndCleaned(String name) throws Exception {
        var before = spoolDirectories();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service().readZip(
                new java.io.ByteArrayInputStream(zipBytes(name))))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode().value()).isEqualTo(400));
        assertThat(spoolDirectories()).isSubsetOf(before);
    }

    @Test
    void normalizedAndCaseInsensitiveZipCollisionsAreRejected() throws Exception {
        for (String alias : List.of("Seed.xlsx", "./seed.xlsx")) {
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> service().readZip(
                    new java.io.ByteArrayInputStream(zipBytes("seed.xlsx", alias))))
                    .hasMessageContaining("Duplicate ZIP path");
        }
    }

    @Test
    void actualExpansionAndDirectoryEntryLimitsApply() throws Exception {
        var service = service();
        org.springframework.test.util.ReflectionTestUtils.setField(service, "maxExpandedBytes", 8L);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.readZip(
                new java.io.ByteArrayInputStream(zipBytes("large.bin"))))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode().value()).isEqualTo(413));
        org.springframework.test.util.ReflectionTestUtils.setField(service, "maxExpandedBytes", 100L);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "maxEntries", 1);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.readZip(
                new java.io.ByteArrayInputStream(zipBytes("first/", "second/"))))
                .hasMessageContaining("ZIP entry limit");
    }

    @Test
    void fiftyThreeMiBBundleStreamsWithinLimits() throws Exception {
        var archive = temp.resolve("large.zip");
        byte[] buffer = new byte[8192];
        try (var zip = new java.util.zip.ZipOutputStream(java.nio.file.Files.newOutputStream(archive))) {
            zip.putNextEntry(new java.util.zip.ZipEntry("large.bin"));
            for (int block = 0; block < 53 * 128; block++) zip.write(buffer);
            zip.closeEntry();
        }
        AdminExcelSeedService.ZipBundle bundle;
        try (var in = java.nio.file.Files.newInputStream(archive)) {
            bundle = service().readZip(in);
        }
        try {
            assertThat(java.nio.file.Files.size(bundle.files().get("large.bin"))).isEqualTo(53L * 1024 * 1024);
        } finally {
            AdminExcelSeedService.deleteSpoolDir(bundle.spoolDir());
        }
        assertThat(bundle.spoolDir()).doesNotExist();
    }

    @Test
    void oversizeWorkbookIsRejectedBeforeReadingAndActualSizeIsBounded() throws Exception {
        var service = service();
        var unreadable = new java.io.InputStream() {
            @Override public int read() { throw new AssertionError("Oversize XLSX was read"); }
        };
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.readXlsx(unreadable, 10L * 1024 * 1024 + 1))
                .hasMessageContaining("XLSX exceeds");
        var oversized = temp.resolve("oversize.xlsx");
        try (var out = new java.io.RandomAccessFile(oversized.toFile(), "rw")) { out.setLength(10L * 1024 * 1024 + 1); }
        try (var in = java.nio.file.Files.newInputStream(oversized)) {
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.readXlsx(in, 1)).hasMessageContaining("XLSX exceeds");
        }
        org.springframework.test.util.ReflectionTestUtils.setField(service, "maxUploadBytes", 5L);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.checkUploadSize(6)).hasMessageContaining("upload limit");
    }

    @Test
    void admissionAndExecutorRejectionDoNotRetainPhantomJobs() throws Exception {
        var service = service();
        assertThat(service.tryReserveImport()).isTrue();
        assertThat(service.tryReserveImport()).isFalse();
        service.shutdown();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.submit(emptyWorkbook(), null, null))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode().value()).isEqualTo(429));
        service.releaseImport();
        assertThat(service.tryReserveImport()).isTrue();
        service.releaseImport();
        assertThat((Map<?, ?>) org.springframework.test.util.ReflectionTestUtils.getField(service, "jobs")).isEmpty();
    }

    @Test
    void terminalHistoryIsBoundedAndUnknownIdsDisappear() throws Exception {
        var service = service();
        var completed = new ArrayList<AdminExcelSeedService.SeedJob>();
        byte[] workbook = emptyWorkbook();
        try {
            for (int index = 0; index < 53; index++) {
                assertThat(service.tryReserveImport()).isTrue();
                var job = service.submit(workbook, null, null);
                awaitCompletion(service, job);
                completed.add(job);
            }
            assertThat(completed.stream().filter(job -> service.get(job.getId()) != null).count()).isEqualTo(50);
            assertThat(service.get(completed.getFirst().getId())).isNull();
            assertThat(service.get(completed.getLast().getId())).isNotNull();
        } finally {
            service.shutdown();
        }
    }

    @Test
    void workerFailureCleansSpoolAndReleasesAdmission() throws Exception {
        var service = service();
        var projects = (com.evidencepilot.repository.ProjectRepository)
                org.springframework.test.util.ReflectionTestUtils.getField(service, "projectRepository");
        when(projects.save(any())).thenThrow(new IllegalStateException("Fixture write failure"));
        byte[] workbook;
        try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(); var out = new java.io.ByteArrayOutputStream()) {
            var sheet = wb.createSheet("projects");
            sheet.createRow(0).createCell(0).setCellValue("project_title");
            sheet.createRow(1).createCell(0).setCellValue("FIXTURE-FAILURE");
            wb.write(out);
            workbook = out.toByteArray();
        }
        var spool = java.nio.file.Files.createDirectory(temp.resolve("worker"));
        java.nio.file.Files.writeString(spool.resolve("owned.txt"), "fixture");
        try {
            assertThat(service.tryReserveImport()).isTrue();
            var job = service.submit(workbook, new AdminExcelSeedService.ZipBundle(Map.of(), List.of(), spool), null);
            awaitCompletion(service, job);
            assertThat(job.getStatus()).isEqualTo("FAILED");
            assertThat(job.getErrors()).anyMatch(error -> error.contains("Fixture write failure"));
            assertThat(spool).doesNotExist();
        } finally {
            service.shutdown();
        }
    }

    @Test
    void fatalFailureAfterOneWriteReportsPartialAndAccountsForRemainingRows() throws Exception {
        var service = service();
        var projects = (com.evidencepilot.repository.ProjectRepository)
                org.springframework.test.util.ReflectionTestUtils.getField(service, "projectRepository");
        when(projects.save(any())).thenAnswer(call -> call.getArgument(0))
                .thenThrow(new IllegalStateException("second row failure"));
        byte[] workbook = workbook(Map.of("projects", List.of(
                row("project_title", "FIRST"), row("project_title", "SECOND"), row("project_title", "THIRD"))));
        try {
            assertThat(service.tryReserveImport()).isTrue();
            var job = service.submit(workbook, null, null);
            awaitCompletion(service, job);
            assertThat(job.getStatus()).isEqualTo("PARTIAL");
            assertThat(job.isComplete()).isFalse();
            assertThat(job.getSuccessfulRows()).isOne();
            assertThat(job.getFailedRows()).isOne();
            assertThat(job.getSkippedRows()).isOne();
            assertThat(job.getProcessed()).isEqualTo(job.getTotal()).isEqualTo(3);
            assertThat(job.getResult()).containsEntry("projects", 1);
        } finally { service.shutdown(); }
    }

    @Test
    void userUpdatesCountOnceAndInvitationSubcountsOnlyCoverNewUsers() throws Exception {
        var service = service();
        var admin = (AdminService) org.springframework.test.util.ReflectionTestUtils.getField(service, "adminService");
        when(admin.importUsers(any(), eq(false))).thenReturn(new com.evidencepilot.dto.response.AdminUserImportResponse(1, 1, List.of()));
        var rows = List.of(row("email", "new@fixture.test", "role", "INSTRUCTOR", "send_invitation", "TRUE"),
                row("email", "updated@fixture.test", "role", "INSTRUCTOR", "send_invitation", "TRUE"));
        try {
            assertThat(service.tryReserveImport()).isTrue();
            var job = service.submit(workbook(Map.of("users", rows)), null, null);
            awaitCompletion(service, job);
            assertThat(job.getStatus()).isEqualTo("DONE");
            assertThat(job.isComplete()).isTrue();
            assertThat(job.getSuccessfulRows()).isEqualTo(2);
            assertThat(job.getProcessed()).isEqualTo(2);
            assertThat(job.getResult()).containsEntry("users", 2).containsEntry("users_updated", 1)
                    .containsEntry("users_invitation_requested", 1).containsEntry("users_silent_created", 0);
        } finally { service.shutdown(); }
    }

    @Test
    void failedUserValidationAccountsForErrorsAndSkippedBatchRows() throws Exception {
        var service = service();
        var admin = (AdminService) org.springframework.test.util.ReflectionTestUtils.getField(service, "adminService");
        when(admin.importUsers(any(), eq(false))).thenReturn(new com.evidencepilot.dto.response.AdminUserImportResponse(0, 0,
                List.of(new com.evidencepilot.dto.response.AdminUserImportResponse.ImportError(1, "firstName", "Invalid name"))));
        var rows = List.of(row("email", "invalid@fixture.test", "role", "INSTRUCTOR", "send_invitation", "TRUE"),
                row("email", "skipped@fixture.test", "role", "INSTRUCTOR", "send_invitation", "TRUE"));
        try {
            assertThat(service.tryReserveImport()).isTrue();
            var job = service.submit(workbook(Map.of("users", rows)), null, null);
            awaitCompletion(service, job);
            assertThat(job.getStatus()).isEqualTo("FAILED");
            assertThat(job.getSuccessfulRows()).isZero();
            assertThat(job.getFailedRows()).isOne();
            assertThat(job.getSkippedRows()).isOne();
            assertThat(job.getProcessed()).isEqualTo(2);
        } finally { service.shutdown(); }
    }

    @Test
    void existingTitleRejectsBeforeUsersOrProjectsAreWritten() throws Exception {
        var service = service();
        var projects = (com.evidencepilot.repository.ProjectRepository)
                org.springframework.test.util.ReflectionTestUtils.getField(service, "projectRepository");
        when(projects.findExistingTitles(any())).thenReturn(List.of("EXISTING"));
        assertThat(service.tryReserveImport()).isTrue();
        try {
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.submit(workbook(Map.of("projects", List.of(row("project_title", "EXISTING")))), null, null))
                    .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(409));
            verify(projects, org.mockito.Mockito.never()).save(any());
            org.mockito.Mockito.verifyNoInteractions(org.springframework.test.util.ReflectionTestUtils.getField(service, "adminService"));
        } finally { service.releaseImport(); service.shutdown(); }
    }

    private static byte[] workbook(Map<String, List<Map<String, String>>> sheets) throws Exception {
        try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(); var out = new java.io.ByteArrayOutputStream()) {
            sheets.forEach((name, rows) -> {
                var sheet = wb.createSheet(name);
                var headers = new ArrayList<>(rows.getFirst().keySet());
                var header = sheet.createRow(0);
                for (int index = 0; index < headers.size(); index++) header.createCell(index).setCellValue(headers.get(index));
                for (int index = 0; index < rows.size(); index++) {
                    var row = sheet.createRow(index + 1);
                    for (int col = 0; col < headers.size(); col++) row.createCell(col).setCellValue(rows.get(index).getOrDefault(headers.get(col), ""));
                }
            });
            wb.write(out);
            return out.toByteArray();
        }
    }

    private static void awaitCompletion(AdminExcelSeedService service, AdminExcelSeedService.SeedJob job) throws Exception {
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            if (!List.of("RUNNING", "QUEUED").contains(job.getStatus()) && service.tryReserveImport()) {
                service.releaseImport();
                return;
            }
            Thread.sleep(10);
        }
        throw new AssertionError("Seed job did not finish");
    }

    private static byte[] emptyWorkbook() throws Exception {
        try (var wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook(); var out = new java.io.ByteArrayOutputStream()) {
            wb.createSheet("users").createRow(0).createCell(0).setCellValue("email");
            wb.write(out);
            return out.toByteArray();
        }
    }

    private static byte[] zipBytes(String... names) throws Exception {
        try (var out = new java.io.ByteArrayOutputStream(); var zip = new java.util.zip.ZipOutputStream(out)) {
            for (String name : names) {
                zip.putNextEntry(new java.util.zip.ZipEntry(name));
                zip.write(new byte[9]);
                zip.closeEntry();
            }
            zip.finish();
            return out.toByteArray();
        }
    }

    private static java.util.Set<java.nio.file.Path> spoolDirectories() throws Exception {
        try (var paths = java.nio.file.Files.list(java.nio.file.Path.of(System.getProperty("java.io.tmpdir")))) {
            return paths.filter(path -> path.getFileName().toString().startsWith("seed-zip-"))
                    .collect(java.util.stream.Collectors.toSet());
        }
    }

    @Test
    void secondPaperForSameProjectIsRejected() {
        var sheets = Map.of(
                "projects", List.of(row("project_title", "P", "_row", "2")),
                "papers", List.of(
                        row("project_title", "P", "paper_folder", "a", "paper_file", "", "content_tex", "x", "_row", "2"),
                        row("project_title", "P", "paper_folder", "b", "paper_file", "", "content_tex", "y", "_row", "3")));
        assertThat(service().validate(sheets)).anyMatch(m -> m.contains("max 1"));
    }

    private record DoiMocks(
            AdminExcelSeedService service,
            com.evidencepilot.repository.ProjectRepository projects,
            com.evidencepilot.repository.ProjectMemberRepository members,
            com.evidencepilot.repository.DocumentRepository documents,
            com.evidencepilot.client.openalex.OpenAlexClient openAlex,
            OpenAlexIngestionService ingestion,
            DocumentObjectStorage storage,
            com.evidencepilot.service.impl.DocumentPersistenceService persistence,
            com.evidencepilot.service.impl.ProjectCollectionService collections) {
    }

    private DoiMocks doiService() {
        var projects = mock(com.evidencepilot.repository.ProjectRepository.class);
        var members = mock(com.evidencepilot.repository.ProjectMemberRepository.class);
        var documents = mock(com.evidencepilot.repository.DocumentRepository.class);
        var openAlex = mock(com.evidencepilot.client.openalex.OpenAlexClient.class);
        var ingestion = mock(OpenAlexIngestionService.class);
        var storage = mock(DocumentObjectStorage.class);
        var persistence = mock(com.evidencepilot.service.impl.DocumentPersistenceService.class);
        var collections = mock(com.evidencepilot.service.impl.ProjectCollectionService.class);
        var service = new AdminExcelSeedService(
                mock(AdminService.class),
                mock(com.evidencepilot.repository.UserRepository.class),
                projects, members, documents,
                mock(com.evidencepilot.repository.DocumentTextRepository.class),
                mock(com.evidencepilot.repository.DocumentChunkRepository.class),
                mock(com.evidencepilot.repository.PaperSectionRepository.class),
                mock(DocumentService.class),
                mock(MediaAssetService.class),
                mock(PaperProcessingService.class),
                openAlex, ingestion, storage, persistence, collections,
                mock(com.fasterxml.jackson.databind.ObjectMapper.class), localPolicy(), mock(org.springframework.transaction.PlatformTransactionManager.class));
        return new DoiMocks(service, projects, members, documents, openAlex, ingestion, storage, persistence, collections);
    }

    private static com.evidencepilot.model.Project doiProject(String title) {
        var p = new com.evidencepilot.model.Project();
        p.setId(java.util.UUID.randomUUID());
        p.setTitle(title);
        p.setStatus(com.evidencepilot.model.enums.ProjectStatus.IN_PROGRESS);
        return p;
    }

    private static com.evidencepilot.model.User doiInstructor() {
        var u = new com.evidencepilot.model.User();
        u.setId(java.util.UUID.randomUUID());
        u.setEmail("prof@example.test");
        u.setRole(com.evidencepilot.model.enums.UserRole.INSTRUCTOR);
        return u;
    }

    private static com.evidencepilot.model.ProjectMember doiMembership(
            com.evidencepilot.model.Project project, com.evidencepilot.model.User user) {
        var m = new com.evidencepilot.model.ProjectMember();
        m.setProject(project);
        m.setUser(user);
        m.setRole(com.evidencepilot.model.enums.ProjectRole.INSTRUCTOR);
        return m;
    }

    private static com.evidencepilot.dto.openalex.OpenAlexWorkResponse doiWork(String oaPdfUrl) {
        var oa = oaPdfUrl == null ? null
                : new com.evidencepilot.dto.openalex.OpenAlexWorkResponse.OpenAlexOpenAccess(
                        true, "gold", oaPdfUrl, true);
        return new com.evidencepilot.dto.openalex.OpenAlexWorkResponse(
                "https://openalex.org/W1", "10.48550/arXiv.2004.04906",
                "Dense Passage Retrieval for Open-Domain Question Answering",
                List.of(new com.evidencepilot.dto.openalex.OpenAlexWorkResponse.OpenAlexAuthor(
                        new com.evidencepilot.dto.openalex.OpenAlexWorkResponse.Author("Karpukhin, V."))),
                null, null, oa, null, 2020, null, null, 5600);
    }

    private static Map<String, String> doiRow(String project, String doi, String rowNum) {
        return row("project_title", project, "doi", doi, "title", "", "authors", "",
                "publication_year", "", "publisher", "", "cited_by_count", "",
                "abstract_or_text", "", "_row", rowNum);
    }

    @Test
    void commitSourcesUnknownDoiRecordsRowError() {
        var t = doiService();
        var project = doiProject("P");
        var instructor = doiInstructor();
        when(t.members().findByProjectId(project.getId()))
                .thenReturn(List.of(doiMembership(project, instructor)));
        when(t.documents().countActiveProjectSourcesByDoi(any(), any(), anyString())).thenReturn(0L);
        when(t.openAlex().fetchWork(anyString())).thenThrow(
                new com.evidencepilot.client.openalex.OpenAlexClient.OpenAlexApiException("not found", 404));
        var job = new AdminExcelSeedService.SeedJob();
        int n = t.service().commitSources(
                List.of(doiRow("P", "10.1234/bogus-doi-xyz", "2")), job, Map.of("P", project));
        assertThat(n).isZero();
        assertThat(job.getErrors()).anyMatch(m -> m.contains("DOI not resolvable"));
        assertThat(job.getFailedRows()).isEqualTo(1);
        assertThat(job.getProcessed()).isEqualTo(1);
        verify(t.documents(), never()).save(any(com.evidencepilot.model.Document.class));
    }

    @Test
    void commitSourcesWithoutOaPdfSavesMetadataOnly() {
        var t = doiService();
        var project = doiProject("P");
        var instructor = doiInstructor();
        when(t.members().findByProjectId(project.getId()))
                .thenReturn(List.of(doiMembership(project, instructor)));
        when(t.documents().countActiveProjectSourcesByDoi(any(), any(), anyString())).thenReturn(0L);
        when(t.openAlex().fetchWork(anyString())).thenReturn(doiWork(null));
        when(t.documents().save(any(com.evidencepilot.model.Document.class)))
                .thenAnswer(inv -> {
                    var d = (com.evidencepilot.model.Document) inv.getArgument(0);
                    if (d.getId() == null) d.setId(java.util.UUID.randomUUID());
                    return d;
                });
        var job = new AdminExcelSeedService.SeedJob();
        int n = t.service().commitSources(
                List.of(doiRow("P", "10.1234/no-oa-pdf", "2")), job);
        assertThat(n).isOne();
        assertThat(job.getErrors()).isEmpty();
        var captor = org.mockito.ArgumentCaptor.forClass(com.evidencepilot.model.Document.class);
        verify(t.documents(), times(2)).save(captor.capture());
        assertThat(captor.getAllValues().getLast().getProcessingStatus())
                .isEqualTo(com.evidencepilot.model.enums.ProcessingStatus.METADATA_FETCHED);
        verify(t.storage(), never()).writeWithSha256(anyString(), any(byte[].class), anyString());
        verify(t.persistence(), never()).markDocumentAsUploaded(any(), any(), any());
        verify(t.collections()).syncSource(any(com.evidencepilot.model.Document.class));
    }

    @Test
    void commitSourcesFallsBackToSheetMetadataForUnresolvableArxivDoi() {
        var t = doiService();
        var project = doiProject("P");
        var instructor = doiInstructor();
        when(t.members().findByProjectId(project.getId()))
                .thenReturn(List.of(doiMembership(project, instructor)));
        when(t.documents().countActiveProjectSourcesByDoi(any(), any(), anyString())).thenReturn(0L);
        // DataCite arXiv DOIs skip the doomed direct lookup entirely.
        when(t.openAlex().downloadPdf(anyString())).thenAnswer(inv ->
                new java.io.ByteArrayInputStream("%PDF-1.4 fake-bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        when(t.storage().writeWithSha256(anyString(), any(byte[].class), anyString())).thenReturn("hash");
        when(t.documents().save(any(com.evidencepilot.model.Document.class))).thenAnswer(inv -> {
            var d = (com.evidencepilot.model.Document) inv.getArgument(0);
            if (d.getId() == null) d.setId(java.util.UUID.randomUUID());
            return d;
        });
        when(t.persistence().markDocumentAsUploaded(any(), any(), any()))
                .thenReturn(new com.evidencepilot.model.Document());
        var job = new AdminExcelSeedService.SeedJob();
        int n = t.service().commitSources(List.of(
                row("project_title", "P", "doi", "10.48550/arXiv.1706.03762",
                        "title", "Attention Is All You Need",
                        "authors", "Vaswani, A.; Shazeer, N.",
                        "publication_year", "2017", "publisher", "NeurIPS",
                        "cited_by_count", "102400", "abstract_or_text", "Transformer.",
                        "_row", "2")), job, Map.of("P", project));
        assertThat(n).isOne();
        assertThat(job.getErrors()).isEmpty();
        // arXiv DataCite DOIs resolve to a direct arXiv PDF, not OpenAlex
        verify(t.openAlex()).downloadPdf("https://arxiv.org/pdf/1706.03762");
        var captor = org.mockito.ArgumentCaptor.forClass(com.evidencepilot.model.Document.class);
        verify(t.documents(), atLeastOnce()).save(captor.capture());
        // every persisted state carries a status — null crashed MySQL NOT NULL inserts
        assertThat(captor.getAllValues()).allMatch(d -> d.getProcessingStatus() != null);
        assertThat(captor.getAllValues().getFirst().getTitle()).isEqualTo("Attention Is All You Need");
        assertThat(captor.getAllValues().getFirst().getDoi()).isEqualTo("10.48550/arXiv.1706.03762");
        assertThat(captor.getAllValues().getFirst().getPublicationYear()).isEqualTo(2017);
    }

    @Test
    void commitSourcesSkipsDirectLookupForDataCiteArxivDoi() {
        var t = doiService();
        var project = doiProject("P");
        var instructor = doiInstructor();
        when(t.projects().findAll()).thenReturn(List.of(project));
        when(t.members().findByProjectId(project.getId()))
                .thenReturn(List.of(doiMembership(project, instructor)));
        when(t.documents().countActiveProjectSourcesByDoi(any(), any(), anyString())).thenReturn(0L);
        when(t.openAlex().downloadPdf(anyString())).thenAnswer(inv ->
                new java.io.ByteArrayInputStream("%PDF-1.4 fake-bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        when(t.storage().writeWithSha256(anyString(), any(byte[].class), anyString())).thenReturn("hash");
        when(t.documents().save(any(com.evidencepilot.model.Document.class))).thenAnswer(inv -> {
            var d = (com.evidencepilot.model.Document) inv.getArgument(0);
            if (d.getId() == null) d.setId(java.util.UUID.randomUUID());
            return d;
        });
        when(t.persistence().markDocumentAsUploaded(any(), any(), any()))
                .thenReturn(new com.evidencepilot.model.Document());
        var job = new AdminExcelSeedService.SeedJob();
        int n = t.service().commitSources(List.of(
                row("project_title", "P", "doi", "10.48550/arXiv.1706.03762",
                        "title", "Attention Is All You Need",
                        "authors", "Vaswani, A.", "publication_year", "2017",
                        "publisher", "NeurIPS", "cited_by_count", "102400",
                        "abstract_or_text", "Transformer.", "_row", "2")), job);
        assertThat(n).isOne();
        assertThat(job.getErrors()).isEmpty();
        verify(t.openAlex(), never()).fetchWork(anyString());
    }

    @Test
    void commitSourcesSkipsDirectLookupForDataCiteArxivDoi() {
        var t = doiService();
        var project = doiProject("P");
        var instructor = doiInstructor();
        when(t.projects().findAll()).thenReturn(List.of(project));
        when(t.members().findByProjectId(project.getId()))
                .thenReturn(List.of(doiMembership(project, instructor)));
        when(t.documents().countActiveProjectSourcesByDoi(any(), any(), anyString())).thenReturn(0L);
        var live = doiWork(null);
        when(t.openAlex().findWorkByTitle(anyString())).thenReturn(live);
        when(t.documents().save(any(com.evidencepilot.model.Document.class))).thenAnswer(inv -> {
            var d = (com.evidencepilot.model.Document) inv.getArgument(0);
            if (d.getId() == null) d.setId(java.util.UUID.randomUUID());
            return d;
        });
        var job = new AdminExcelSeedService.SeedJob();
        int n = t.service().commitSources(List.of(
                row("project_title", "P", "doi", "10.48550/arXiv.2004.04906",
                        "title", "Dense Passage Retrieval for Open-Domain Question Answering",
                        "authors", "Karpukhin, V.", "publication_year", "2020",
                        "publisher", "arXiv", "cited_by_count", "5600",
                        "abstract_or_text", "DPR.", "_row", "2")), job, Map.of("P", project));
        assertThat(n).isOne();
        assertThat(job.getErrors()).isEmpty();
        verify(t.openAlex()).findWorkByTitle("Dense Passage Retrieval for Open-Domain Question Answering");
        var captor = org.mockito.ArgumentCaptor.forClass(com.evidencepilot.model.Document.class);
        verify(t.documents(), atLeastOnce()).save(captor.capture());
        assertThat(captor.getAllValues().getFirst().getTitle())
                .isEqualTo("Dense Passage Retrieval for Open-Domain Question Answering");
        assertThat(captor.getAllValues().getFirst().getDoi()).isEqualTo("10.48550/arXiv.2004.04906");
        // citation edges persisted so visual maps render cite/cited lines
        verify(t.ingestion()).persistCitationGraph(any(com.evidencepilot.model.Document.class), eq(live));
    }

    @Test
    void commitSourcesDownloadsUniqueDoiOnceAcrossProjects() {
        var t = doiService();
        var p1 = doiProject("P1");
        var p2 = doiProject("P2");
        var instructor = doiInstructor();
        when(t.members().findByProjectId(any())).thenReturn(List.of(doiMembership(p1, instructor)));
        when(t.documents().countActiveProjectSourcesByDoi(any(), any(), anyString())).thenReturn(0L);
        when(t.openAlex().fetchWork(anyString())).thenReturn(doiWork("https://arxiv.org/pdf/2004.04906"));
        when(t.openAlex().downloadPdf(anyString())).thenAnswer(inv ->
                new java.io.ByteArrayInputStream("%PDF-1.4 fake-bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        when(t.storage().writeWithSha256(anyString(), any(byte[].class), anyString())).thenReturn("hash");
        when(t.documents().save(any(com.evidencepilot.model.Document.class))).thenAnswer(inv -> {
            var d = (com.evidencepilot.model.Document) inv.getArgument(0);
            if (d.getId() == null) d.setId(java.util.UUID.randomUUID());
            return d;
        });
        when(t.persistence().markDocumentAsUploaded(any(), any(), any()))
                .thenReturn(new com.evidencepilot.model.Document());
        var job = new AdminExcelSeedService.SeedJob();
        int n = t.service().commitSources(List.of(
                doiRow("P1", "10.1234/shared-doi", "2"),
                doiRow("P2", "10.1234/shared-doi", "3")), job);
        assertThat(n).isEqualTo(2);
        assertThat(job.getSuccessfulRows()).isEqualTo(2);
        assertThat(job.getProcessed()).isEqualTo(2);
        verify(t.openAlex(), times(1)).fetchWork(anyString());
        verify(t.openAlex(), times(1)).downloadPdf(anyString());
        verify(t.storage(), times(2)).writeWithSha256(anyString(), any(byte[].class), anyString());
        verify(t.persistence(), times(2)).markDocumentAsUploaded(any(), any(), any());
    }

    @Test
    void commitSourcesSkipsDuplicateDoiInProject() {
        var t = doiService();
        var project = doiProject("P");
        var instructor = doiInstructor();
        when(t.members().findByProjectId(project.getId()))
                .thenReturn(List.of(doiMembership(project, instructor)));
        when(t.documents().countActiveProjectSourcesByDoi(any(), any(), anyString())).thenReturn(1L);
        var job = new AdminExcelSeedService.SeedJob();
        int n = t.service().commitSources(
                List.of(doiRow("P", "10.48550/arXiv.2004.04906", "2")), job, Map.of("P", project));
        assertThat(n).isZero();
        assertThat(job.getErrors()).anyMatch(m -> m.contains("already in project"));
        assertThat(job.getSkippedRows()).isEqualTo(1);
        assertThat(job.getProcessed()).isEqualTo(1);
        verify(t.openAlex(), never()).fetchWork(anyString());
    }

    private static Map<String, String> collectionRow(String title, String owner, String dois, String rowNum) {
        return row("collection_title", title, "description", "", "owner_email", owner,
                "source_dois", dois, "_row", rowNum);
    }

    @Test
    void collectionsSheetValidation() {
        var sheets = new HashMap<String, List<Map<String, String>>>();
        sheets.put("users", List.of(
                row("email", "prof@example.test", "role", "INSTRUCTOR", "_row", "2")));
        sheets.put("projects", List.of(row("project_title", "P", "_row", "2")));
        sheets.put("sources", List.of(
                row("project_title", "P", "doi", "10.1234/abc", "_row", "2")));
        sheets.put("collections", List.of(
                collectionRow("C1", "prof@example.test", "10.1234/abc", "2"),
                collectionRow("C1", "ghost@example.test", "10.9999/nope; not-a-doi", "3"),
                collectionRow("", "prof@example.test", "", "4")));
        var errors = service().validate(sheets);
        assertThat(errors).anyMatch(m -> m.contains("duplicate collection_title"));
        assertThat(errors).anyMatch(m -> m.contains("owner_email must be"));
        assertThat(errors).anyMatch(m -> m.contains("unknown sources-sheet doi"));
        assertThat(errors).anyMatch(m -> m.contains("invalid DOI format"));
        assertThat(errors).anyMatch(m -> m.contains("collection_title required"));
        assertThat(errors).anyMatch(m -> m.contains("at least one DOI"));
    }

    @Test
    void commitCollectionsCreatesAndLinksByDoi() {
        var users = mock(com.evidencepilot.repository.UserRepository.class);
        var documents = mock(com.evidencepilot.repository.DocumentRepository.class);
        var collections = mock(com.evidencepilot.service.impl.ProjectCollectionService.class);
        var service = new AdminExcelSeedService(
                mock(AdminService.class),
                users,
                mock(com.evidencepilot.repository.ProjectRepository.class),
                mock(com.evidencepilot.repository.ProjectMemberRepository.class),
                documents,
                mock(com.evidencepilot.repository.DocumentTextRepository.class),
                mock(com.evidencepilot.repository.DocumentChunkRepository.class),
                mock(DocumentService.class),
                mock(MediaAssetService.class),
                mock(PaperProcessingService.class),
                mock(com.evidencepilot.client.openalex.OpenAlexClient.class),
                mock(OpenAlexIngestionService.class),
                mock(DocumentObjectStorage.class),
                mock(com.evidencepilot.service.impl.DocumentPersistenceService.class),
                collections,
                mock(com.fasterxml.jackson.databind.ObjectMapper.class));
        var owner = doiInstructor();
        when(users.findByEmail("prof@example.test"))
                .thenReturn(java.util.Optional.of(owner));
        var doc = new com.evidencepilot.model.Document();
        doc.setId(java.util.UUID.randomUUID());
        when(documents.findActiveSourcesByDoi(
                eq(com.evidencepilot.model.enums.DocumentType.SOURCE), eq("10.1234/abc")))
                .thenReturn(List.of(doc));
        var collection = new com.evidencepilot.model.Collection();
        collection.setId(java.util.UUID.randomUUID());
        when(collections.createSeedCollection(eq(owner), eq("C1"), any()))
                .thenReturn(collection);
        var job = new AdminExcelSeedService.SeedJob();
        int n = service.commitCollections(
                List.of(collectionRow("C1", "prof@example.test", "10.1234/abc; 10.1234/abc", "2")), job);
        assertThat(n).isEqualTo(1);
        verify(collections, times(1)).addSource(doc, collection, owner);
        assertThat(job.getErrors()).isEmpty();
    }

    @Test
    void commitCollectionsSkipsUnknownOwner() {
        var users = mock(com.evidencepilot.repository.UserRepository.class);
        var collections = mock(com.evidencepilot.service.impl.ProjectCollectionService.class);
        var service = new AdminExcelSeedService(
                mock(AdminService.class),
                users,
                mock(com.evidencepilot.repository.ProjectRepository.class),
                mock(com.evidencepilot.repository.ProjectMemberRepository.class),
                mock(com.evidencepilot.repository.DocumentRepository.class),
                mock(com.evidencepilot.repository.DocumentTextRepository.class),
                mock(com.evidencepilot.repository.DocumentChunkRepository.class),
                mock(DocumentService.class),
                mock(MediaAssetService.class),
                mock(PaperProcessingService.class),
                mock(com.evidencepilot.client.openalex.OpenAlexClient.class),
                mock(OpenAlexIngestionService.class),
                mock(DocumentObjectStorage.class),
                mock(com.evidencepilot.service.impl.DocumentPersistenceService.class),
                collections,
                mock(com.fasterxml.jackson.databind.ObjectMapper.class));
        when(users.findByEmail(anyString())).thenReturn(java.util.Optional.empty());
        var job = new AdminExcelSeedService.SeedJob();
        int n = service.commitCollections(
                List.of(collectionRow("C1", "ghost@example.test", "10.1234/abc", "2")), job);
        assertThat(n).isZero();
        assertThat(job.getErrors()).anyMatch(m -> m.contains("unresolvable owner"));
        verify(collections, never()).createSeedCollection(any(), any(), any());
    }
}
