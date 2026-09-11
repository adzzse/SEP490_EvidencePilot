package com.evidencepilot.service;

import com.evidencepilot.model.Collection;
import com.evidencepilot.model.CollectionDocument;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AdminSeedExportServiceTest {

    private AdminSeedExportService exportService(
            com.evidencepilot.repository.ProjectRepository projects,
            com.evidencepilot.repository.ProjectMemberRepository members,
            com.evidencepilot.repository.DocumentRepository documents,
            com.evidencepilot.repository.DocumentTextRepository texts,
            com.evidencepilot.repository.PaperSectionRepository sections,
            com.evidencepilot.repository.CollectionRepository collections,
            com.evidencepilot.repository.CollectionDocumentRepository memberships,
            DocumentObjectStorage storage) {
        return new AdminSeedExportService(
                projects, members, documents, texts, sections,
                collections, memberships, storage);
    }

    private User user(String email, UserRole role, String code) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(email);
        user.setFirstName("First");
        user.setLastName("Last");
        user.setRole(role);
        user.setStudentCode(code);
        user.setAccountStatus(AccountStatus.ACTIVE);
        return user;
    }

    private Project project(String title) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle(title);
        project.setDescription("desc");
        project.setStatus(ProjectStatus.IN_PROGRESS);
        project.setTargetStandard(PaperStandard.IEEE);
        project.setActive(true);
        return project;
    }

    private AdminExcelSeedService seedService() {
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
                mock(com.fasterxml.jackson.databind.ObjectMapper.class),
                new DevBypassPolicy(true, new org.springframework.mock.env.MockEnvironment()
                        .withProperty("spring.profiles.active", "test")),
                mock(org.springframework.transaction.PlatformTransactionManager.class));
    }

    @Test
    void exportedBundleReparsesWithZeroErrors() throws Exception {
        User instructor = user("prof@example.test", UserRole.INSTRUCTOR, null);
        User student = user("demo01@example.test", UserRole.STUDENT, "AB123456");
        Project project = project("P1");
        ProjectMember m1 = new ProjectMember();
        m1.setProject(project);
        m1.setUser(instructor);
        m1.setRole(ProjectRole.INSTRUCTOR);
        ProjectMember m2 = new ProjectMember();
        m2.setProject(project);
        m2.setUser(student);
        m2.setRole(ProjectRole.MEMBER);

        Document source = new Document();
        source.setId(UUID.randomUUID());
        source.setProject(project);
        source.setDocType(DocumentType.SOURCE);
        source.setDoi("10.1234/abc");
        source.setTitle("Source Title");
        source.setAuthors("Author, A.");
        source.setPublicationYear(2020);
        source.setPublisher("IEEE");
        source.setCitedByCount(7);
        source.setActive(true);

        Document stub = new Document();
        stub.setId(UUID.randomUUID());
        stub.setProject(project);
        stub.setDocType(DocumentType.PAPER);
        stub.setFileUrl("placeholder");
        stub.setOriginalFilename("_standard_IEEE.tex");
        stub.setTitle("Stub");
        stub.setActive(true);

        Document paper = new Document();
        paper.setId(UUID.randomUUID());
        paper.setProject(project);
        paper.setDocType(DocumentType.PAPER);
        paper.setFileUrl("objects/paper.pdf");
        paper.setOriginalFilename("paper.pdf");
        paper.setTitle("Real Paper");
        paper.setActive(true);

        Collection collection = new Collection();
        collection.setId(UUID.randomUUID());
        collection.setTitle("C1");
        collection.setDescription("desc");
        collection.setInstructor(instructor);
        collection.setActive(true);
        CollectionDocument membership = new CollectionDocument();
        membership.setCollection(collection);
        membership.setDocument(source);

        var projects = mock(com.evidencepilot.repository.ProjectRepository.class);
        var members = mock(com.evidencepilot.repository.ProjectMemberRepository.class);
        var documents = mock(com.evidencepilot.repository.DocumentRepository.class);
        var texts = mock(com.evidencepilot.repository.DocumentTextRepository.class);
        var sections = mock(com.evidencepilot.repository.PaperSectionRepository.class);
        var collections = mock(com.evidencepilot.repository.CollectionRepository.class);
        var memberships = mock(com.evidencepilot.repository.CollectionDocumentRepository.class);
        var storage = mock(DocumentObjectStorage.class);
        when(projects.findAll()).thenReturn(List.of(project));
        when(members.findAll()).thenReturn(List.of(m1, m2));
        when(documents.findAll()).thenReturn(List.of(source, stub, paper));
        when(sections.findByDocumentIdOrderBySectionOrderAsc(any())).thenReturn(List.of());
        when(collections.findAll()).thenReturn(List.of(collection));
        when(memberships.findByCollectionId(collection.getId())).thenReturn(List.of(membership));
        when(storage.exists("objects/paper.pdf")).thenReturn(true);

        AdminSeedExportService.SeedBundle bundle =
                exportService(projects, members, documents, texts, sections,
                        collections, memberships, storage).buildBundle(null);

        assertThat(bundle.paperFiles()).singleElement().satisfies(file ->
                assertThat(file.zipPath()).startsWith("papers/"));

        AdminExcelSeedService.ParsedSeed parsed;
        try (var in = new ByteArrayInputStream(bundle.xlsx())) {
            parsed = seedService().parse(in, bundle.xlsx().length);
        }
        assertThat(parsed.errors()).as(String.join("; ", parsed.errors())).isEmpty();
        assertThat(parsed.sheets().get("users")).hasSize(2);
        assertThat(parsed.sheets().get("projects")).hasSize(1);
        assertThat(parsed.sheets().get("members")).hasSize(2);
        assertThat(parsed.sheets().get("sources")).hasSize(1);
        // One paper per project: the file-backed paper wins over the stub.
        assertThat(parsed.sheets().get("papers")).hasSize(1);
        assertThat(parsed.sheets().get("papers").getFirst().get("paper_file"))
                .startsWith("papers/");
        assertThat(parsed.sheets().get("collections")).hasSize(1);
    }

    @Test
    void stubPaperExportsAsStandardRow() throws Exception {
        User instructor = user("prof@example.test", UserRole.INSTRUCTOR, null);
        Project project = project("P1");
        ProjectMember member = new ProjectMember();
        member.setProject(project);
        member.setUser(instructor);
        member.setRole(ProjectRole.INSTRUCTOR);
        Document stub = new Document();
        stub.setId(UUID.randomUUID());
        stub.setProject(project);
        stub.setDocType(DocumentType.PAPER);
        stub.setFileUrl("placeholder");
        stub.setOriginalFilename("_standard_IEEE.tex");
        stub.setTitle("Stub");
        stub.setActive(true);

        var projects = mock(com.evidencepilot.repository.ProjectRepository.class);
        var members = mock(com.evidencepilot.repository.ProjectMemberRepository.class);
        var documents = mock(com.evidencepilot.repository.DocumentRepository.class);
        var texts = mock(com.evidencepilot.repository.DocumentTextRepository.class);
        var sections = mock(com.evidencepilot.repository.PaperSectionRepository.class);
        var collections = mock(com.evidencepilot.repository.CollectionRepository.class);
        var memberships = mock(com.evidencepilot.repository.CollectionDocumentRepository.class);
        var storage = mock(DocumentObjectStorage.class);
        when(projects.findAll()).thenReturn(List.of(project));
        when(members.findAll()).thenReturn(List.of(member));
        when(documents.findAll()).thenReturn(List.of(stub));
        when(collections.findAll()).thenReturn(List.of());

        AdminSeedExportService.SeedBundle bundle =
                exportService(projects, members, documents, texts, sections,
                        collections, memberships, storage).buildBundle(null);

        AdminExcelSeedService.ParsedSeed parsed;
        try (var in = new ByteArrayInputStream(bundle.xlsx())) {
            parsed = seedService().parse(in, bundle.xlsx().length);
        }
        assertThat(parsed.errors()).as(String.join("; ", parsed.errors())).isEmpty();
        assertThat(parsed.sheets().get("papers")).hasSize(1);
        assertThat(parsed.sheets().get("papers").getFirst().get("paper_standard")).isEqualTo("IEEE");
        assertThat(bundle.paperFiles()).isEmpty();
    }

    @Test
    void unrestorableRowsAreSkipped() throws Exception {
        User noCode = user("nocode@example.test", UserRole.STUDENT, null);
        User instructor = user("prof@example.test", UserRole.INSTRUCTOR, null);
        Project project = project("P1");
        ProjectMember m1 = new ProjectMember();
        m1.setProject(project);
        m1.setUser(noCode);
        m1.setRole(ProjectRole.MEMBER);
        ProjectMember m2 = new ProjectMember();
        m2.setProject(project);
        m2.setUser(instructor);
        m2.setRole(ProjectRole.INSTRUCTOR);

        Document doiLess = new Document();
        doiLess.setId(UUID.randomUUID());
        doiLess.setProject(project);
        doiLess.setDocType(DocumentType.SOURCE);
        doiLess.setActive(true);

        Collection empty = new Collection();
        empty.setId(UUID.randomUUID());
        empty.setTitle("Empty");
        empty.setInstructor(instructor);
        empty.setActive(true);

        var projects = mock(com.evidencepilot.repository.ProjectRepository.class);
        var members = mock(com.evidencepilot.repository.ProjectMemberRepository.class);
        var documents = mock(com.evidencepilot.repository.DocumentRepository.class);
        var texts = mock(com.evidencepilot.repository.DocumentTextRepository.class);
        var sections = mock(com.evidencepilot.repository.PaperSectionRepository.class);
        var collections = mock(com.evidencepilot.repository.CollectionRepository.class);
        var memberships = mock(com.evidencepilot.repository.CollectionDocumentRepository.class);
        var storage = mock(DocumentObjectStorage.class);
        when(projects.findAll()).thenReturn(List.of(project));
        when(members.findAll()).thenReturn(List.of(m1, m2));
        when(documents.findAll()).thenReturn(List.of(doiLess));
        when(collections.findAll()).thenReturn(List.of(empty));
        when(memberships.findByCollectionId(empty.getId())).thenReturn(List.of());

        AdminSeedExportService.SeedBundle bundle =
                exportService(projects, members, documents, texts, sections,
                        collections, memberships, storage).buildBundle(null);

        AdminExcelSeedService.ParsedSeed parsed;
        try (var in = new ByteArrayInputStream(bundle.xlsx())) {
            parsed = seedService().parse(in, bundle.xlsx().length);
        }
        assertThat(parsed.errors()).as(String.join("; ", parsed.errors())).isEmpty();
        assertThat(parsed.sheets().get("users")).hasSize(1);
        assertThat(parsed.sheets().get("sources")).isEmpty();
        assertThat(parsed.sheets().get("collections")).isEmpty();
        assertThat(bundle.summary()).contains("skipped");
    }
}
