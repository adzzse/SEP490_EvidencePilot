package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.ActivityFeedResponse;
import com.evidencepilot.model.AuditLog;
import com.evidencepilot.model.CollectionCategory;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.AuditLogRepository;
import com.evidencepilot.repository.CollectionCategoryRepository;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ActivityFeedServiceImplTest {

    private UserRepository userRepository;
    private AuditLogRepository auditLogRepository;
    private ProjectRepository projectRepository;
    private CollectionCategoryRepository collectionCategoryRepository;
    private PaperSectionRepository paperSectionRepository;
    private DocumentRepository documentRepository;
    private CollectionRepository collectionRepository;
    private ActivityFeedServiceImpl service;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        auditLogRepository = mock(AuditLogRepository.class);
        projectRepository = mock(ProjectRepository.class);
        collectionCategoryRepository = mock(CollectionCategoryRepository.class);
        paperSectionRepository = mock(PaperSectionRepository.class);
        documentRepository = mock(DocumentRepository.class);
        collectionRepository = mock(CollectionRepository.class);
        service = new ActivityFeedServiceImpl(userRepository, auditLogRepository,
                projectRepository, collectionCategoryRepository,
                paperSectionRepository, documentRepository, collectionRepository);
    }

    private User user(UserRole role) {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setRole(role);
        return u;
    }

    private AuditLog log(String action, String type, UUID entityId) {
        AuditLog l = new AuditLog();
        l.setAction(action);
        l.setEntityType(type);
        l.setEntityId(entityId);
        l.setOccurredAt(LocalDateTime.now());
        return l;
    }

    @Test
    void instructor_projectsProjectRow() {
        User u = user(UserRole.INSTRUCTOR);
        UUID pid = UUID.randomUUID();
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(auditLogRepository.findByActorIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(new PageImpl<>(List.of(log("PROJECT_CREATED", "PROJECT", pid))));
        Project p = new Project();
        p.setId(pid);
        p.setTitle("My Project");
        p.setActive(true);
        when(projectRepository.findById(pid)).thenReturn(Optional.of(p));

        ActivityFeedResponse resp = service.getMyActivity(u.getId(), 10);

        assertThat(resp.role()).isEqualTo(UserRole.INSTRUCTOR);
        assertThat(resp.items()).hasSize(1);
        assertThat(resp.items().get(0).type()).isEqualTo("project");
        assertThat(resp.items().get(0).title()).isEqualTo("My Project");
        assertThat(resp.items().get(0).link()).isEqualTo("/instructor/projects/" + pid);
    }

    @Test
    void instructor_projectsCollectionCategoryRow() {
        User u = user(UserRole.INSTRUCTOR);
        UUID cid = UUID.randomUUID();
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(auditLogRepository.findByActorIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(new PageImpl<>(List.of(log("COLLECTION_CATEGORY_CREATED", "COLLECTION_CATEGORY", cid))));
        CollectionCategory c = new CollectionCategory();
        c.setId(cid);
        c.setName("AI Research");
        when(collectionCategoryRepository.findById(cid)).thenReturn(Optional.of(c));

        ActivityFeedResponse resp = service.getMyActivity(u.getId(), 10);

        assertThat(resp.items()).hasSize(1);
        assertThat(resp.items().get(0).type()).isEqualTo("collection");
        assertThat(resp.items().get(0).title()).isEqualTo("AI Research");
        assertThat(resp.items().get(0).link()).isEqualTo("/instructor/source-library");
    }

    @Test
    void instructor_collectionRow_projectsToCollectionDetail() {
        User u = user(UserRole.INSTRUCTOR);
        UUID cid = UUID.randomUUID();
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(auditLogRepository.findByActorIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(new PageImpl<>(List.of(log("COLLECTION_CREATED", "COLLECTION", cid))));
        com.evidencepilot.model.Collection c = new com.evidencepilot.model.Collection();
        c.setId(cid);
        c.setTitle("Research Collection");
        c.setActive(true);
        when(collectionRepository.findById(cid)).thenReturn(Optional.of(c));
        Document d = new Document();
        d.setActive(true);
        when(documentRepository.findByCollectionId(cid)).thenReturn(List.of(d));

        ActivityFeedResponse resp = service.getMyActivity(u.getId(), 10);

        assertThat(resp.items()).hasSize(1);
        assertThat(resp.items().get(0).type()).isEqualTo("collection");
        assertThat(resp.items().get(0).title()).isEqualTo("Research Collection");
        assertThat(resp.items().get(0).totalSources()).isEqualTo(1L);
        assertThat(resp.items().get(0).link()).isEqualTo("/instructor/collections/" + cid);
    }

    @Test
    void student_projectsPaperSectionRow_routesToSectionWorkspace() {
        User u = user(UserRole.STUDENT);
        UUID sectionId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(auditLogRepository.findByActorIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(new PageImpl<>(List.of(log("SECTION_CONTENT_UPDATED", "PaperSection", sectionId))));

        Project p = new Project();
        p.setId(projectId);
        p.setTitle("My Project");
        p.setActive(true);
        Document doc = new Document();
        doc.setProject(p);
        PaperSection s = new PaperSection();
        s.setId(sectionId);
        s.setSectionTitle("Introduction");
        s.setDocument(doc);
        when(paperSectionRepository.findById(sectionId)).thenReturn(Optional.of(s));

        ActivityFeedResponse resp = service.getMyActivity(u.getId(), 10);

        assertThat(resp.role()).isEqualTo(UserRole.STUDENT);
        assertThat(resp.items()).hasSize(1);
        // ponytail: student "section" rows link to the project root only.
        assertThat(resp.items().get(0).type()).isEqualTo("project-section");
        assertThat(resp.items().get(0).entityId()).isEqualTo(sectionId);
        assertThat(resp.items().get(0).projectId()).isEqualTo(projectId);
        assertThat(resp.items().get(0).title()).isEqualTo("My Project");
        assertThat(resp.items().get(0).subtitle()).isEqualTo("Introduction");
        assertThat(resp.items().get(0).link())
                .isEqualTo("/student/projects/" + projectId);
    }

    @Test
    void student_projectRow_usesStudentLink() {
        User u = user(UserRole.STUDENT);
        UUID pid = UUID.randomUUID();
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(auditLogRepository.findByActorIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(new PageImpl<>(List.of(log("PROJECT_UPDATED", "PROJECT", pid))));
        Project p = new Project();
        p.setId(pid);
        p.setTitle("My Project");
        p.setActive(true);
        when(projectRepository.findById(pid)).thenReturn(Optional.of(p));

        ActivityFeedResponse resp = service.getMyActivity(u.getId(), 10);

        assertThat(resp.role()).isEqualTo(UserRole.STUDENT);
        assertThat(resp.items()).hasSize(1);
        assertThat(resp.items().get(0).type()).isEqualTo("project");
        assertThat(resp.items().get(0).link()).isEqualTo("/student/projects/" + pid);
    }

    @Test
    void instructor_documentUploadedRow_appearsAsSourceItem() {
        User u = user(UserRole.INSTRUCTOR);
        UUID docId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(auditLogRepository.findByActorIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(new PageImpl<>(List.of(log("DOCUMENT_UPLOADED", "DOCUMENT", docId))));

        Project p = new Project();
        p.setId(projectId);
        p.setActive(true);
        Document d = new Document();
        d.setId(docId);
        d.setOriginalFilename("paper-2024.pdf");
        d.setProcessingStatus(com.evidencepilot.model.enums.ProcessingStatus.READY);
        d.setActive(true);
        d.setProject(p);
        when(documentRepository.findById(docId)).thenReturn(Optional.of(d));

        ActivityFeedResponse resp = service.getMyActivity(u.getId(), 10);

        assertThat(resp.items()).hasSize(1);
        assertThat(resp.items().get(0).type()).isEqualTo("source");
        assertThat(resp.items().get(0).title()).isEqualTo("paper-2024.pdf");
        assertThat(resp.items().get(0).status()).isEqualTo("READY");
        assertThat(resp.items().get(0).projectId()).isEqualTo(projectId);
        assertThat(resp.items().get(0).link()).isEqualTo("/instructor/source-library");
    }

    @Test
    void student_documentRow_isSkipped() {
        User u = user(UserRole.STUDENT);
        UUID docId = UUID.randomUUID();
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(auditLogRepository.findByActorIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(new PageImpl<>(List.of(log("DOCUMENT_UPLOADED", "DOCUMENT", docId))));

        ActivityFeedResponse resp = service.getMyActivity(u.getId(), 10);

        // Sources are an instructor surface — students never see a "source" item.
        assertThat(resp.items()).isEmpty();
    }

    @Test
    void skipsUnknownEntityType() {
        User u = user(UserRole.INSTRUCTOR);
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(auditLogRepository.findByActorIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(new PageImpl<>(List.of(log("MYSTERY_ACTION", "MYSTERY", UUID.randomUUID()))));

        ActivityFeedResponse resp = service.getMyActivity(u.getId(), 10);

        assertThat(resp.items()).isEmpty();
    }

    @Test
    void skipsEntityNotFound() {
        User u = user(UserRole.INSTRUCTOR);
        UUID pid = UUID.randomUUID();
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(auditLogRepository.findByActorIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(new PageImpl<>(List.of(log("PROJECT_CREATED", "PROJECT", pid))));
        when(projectRepository.findById(pid)).thenReturn(Optional.empty());

        ActivityFeedResponse resp = service.getMyActivity(u.getId(), 10);

        assertThat(resp.items()).isEmpty();
    }

    @Test
    void missingUser_returnsEmpty() {
        UUID id = UUID.randomUUID();
        when(userRepository.findById(id)).thenReturn(Optional.empty());

        ActivityFeedResponse resp = service.getMyActivity(id, 10);

        assertThat(resp.items()).isEmpty();
        assertThat(resp.role()).isNull();
    }

    @Test
    void limitClampedToOneHundred() {
        User u = user(UserRole.INSTRUCTOR);
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        when(auditLogRepository.findByActorIdOrderByOccurredAtDesc(any(), any()))
                .thenReturn(new PageImpl<>(List.of()));

        service.getMyActivity(u.getId(), 500);

        org.mockito.Mockito.verify(auditLogRepository)
                .findByActorIdOrderByOccurredAtDesc(org.mockito.ArgumentMatchers.eq(u.getId()),
                        org.mockito.ArgumentMatchers.argThat(p -> p.getPageSize() == 100));
    }
}
