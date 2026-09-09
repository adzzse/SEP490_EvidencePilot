package com.evidencepilot.service;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminExcelSeedServiceTest {

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
                mock(PaperProcessingService.class));
    }

    private static Map<String, String> row(Object... kv) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], (String) kv[i + 1]);
        return m;
    }

    private static Map<String, java.nio.file.Path> zip(String... names) {
        Map<String, java.nio.file.Path> m = new HashMap<>();
        // checkZipLayout only inspects keys — values are never read
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
        var service = new AdminExcelSeedService(
                mock(AdminService.class), users, projects, members, documents,
                mock(com.evidencepilot.repository.DocumentTextRepository.class),
                mock(com.evidencepilot.repository.DocumentChunkRepository.class),
                mock(com.evidencepilot.repository.PaperSectionRepository.class),
                mock(DocumentService.class), mock(MediaAssetService.class), papers);

        var projectId = java.util.UUID.randomUUID();
        var project = new com.evidencepilot.model.Project();
        project.setId(projectId);
        project.setTitle("P");
        project.setStatus(com.evidencepilot.model.enums.ProjectStatus.IN_PROGRESS);
        when(projects.findAll()).thenReturn(List.of(project));

        var instructorId = java.util.UUID.randomUUID();
        var instructor = new com.evidencepilot.model.User();
        instructor.setId(instructorId);
        instructor.setRole(com.evidencepilot.model.enums.UserRole.INSTRUCTOR);
        var membership = new com.evidencepilot.model.ProjectMember();
        membership.setRole(com.evidencepilot.model.enums.ProjectRole.INSTRUCTOR);
        membership.setUser(instructor);
        when(members.findByProjectId(projectId)).thenReturn(List.of(membership));

        when(documents.save(any())).thenAnswer(inv -> {
            var doc = (com.evidencepilot.model.Document) inv.getArgument(0);
            doc.setId(java.util.UUID.randomUUID());
            return doc;
        });
        when(papers.createSectionsFromStandard(any(), eq("IEEE"))).thenReturn(List.of());

        var rows = List.of(row("project_title", "P", "paper_folder", "s", "paper_file", "",
                "title", "", "content_tex", "", "paper_standard", "IEEE", "_row", "2"));
        int n = service.commitPapers(rows, Map.of(), null);

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
                mock(PaperProcessingService.class));
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

    @Test
    void secondPaperForSameProjectIsRejected() {
        var sheets = Map.of(
                "projects", List.of(row("project_title", "P", "_row", "2")),
                "papers", List.of(
                        row("project_title", "P", "paper_folder", "a", "paper_file", "", "content_tex", "x", "_row", "2"),
                        row("project_title", "P", "paper_folder", "b", "paper_file", "", "content_tex", "y", "_row", "3")));
        assertThat(service().validate(sheets)).anyMatch(m -> m.contains("max 1"));
    }
}
