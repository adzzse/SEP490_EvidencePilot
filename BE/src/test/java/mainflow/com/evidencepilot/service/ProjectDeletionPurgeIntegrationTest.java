package com.evidencepilot.service;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectDeletionCleanupTask;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectDeletionCleanupTaskRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest
class ProjectDeletionPurgeIntegrationTest {

    @Autowired
    private ProjectDeletionPurgeService purgeService;

    @Autowired
    private ProjectDeletionCleanupService cleanupService;

    @SpyBean
    private ProjectRepository projectRepository;

    @Autowired
    private DocumentRepository documentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProjectDeletionCleanupTaskRepository cleanupTaskRepository;

    @MockBean(name = "minioClient")
    private MinioClient minioClient;

    @MockBean(name = "minioPresignClient")
    private MinioClient minioPresignClient;

    @MockBean
    private RabbitTemplate rabbitTemplate;

    @MockBean
    private JavaMailSender javaMailSender;

    @MockBean
    private DocumentObjectStorage objectStorage;

    @MockBean
    private com.evidencepilot.service.impl.QdrantServiceImpl qdrantService;

    private User testUser;

    @BeforeEach
    void setUp() {
        cleanupTaskRepository.deleteAll();
        documentRepository.deleteAll();
        projectRepository.deleteAll();
        userRepository.deleteAll();

        testUser = new User();
        testUser.setEmail("testuser@example.com");
        testUser.setPasswordHash("hash");
        testUser.setFirstName("Test");
        testUser.setLastName("User");
        testUser.setRole(UserRole.STUDENT);
        testUser.setAccountStatus(AccountStatus.ACTIVE);
        testUser = userRepository.save(testUser);
    }

    private Project createScheduledProject(LocalDateTime scheduledAt) {
        Project project = new Project();
        project.setTitle("Integration Scheduled Project");
        project.setStatus(com.evidencepilot.model.enums.ProjectStatus.IN_PROGRESS);
        project.setTargetStandard(PaperStandard.IEEE);
        project.setActive(true);
        project.setCreatedAt(LocalDateTime.now());
        project.setDeletionScheduledAt(scheduledAt);
        return projectRepository.save(project);
    }

    private Document createDocument(Project project, String key, String hash) {
        Document doc = new Document();
        doc.setTitle("Test Doc");
        doc.setOriginalFilename("test.pdf");
        doc.setContentType("application/pdf");
        doc.setFileSizeBytes(1024L);
        doc.setFileUrl(key);
        doc.setFileHashSha256(hash);
        doc.setUploadedBy(testUser);
        doc.setProject(project);
        doc.setDocType(DocumentType.PAPER);
        doc.setProcessingStatus(com.evidencepilot.model.enums.ProcessingStatus.COMPLETED);
        doc.setDownloadToken(UUID.randomUUID().toString());
        doc.setCreatedAt(LocalDateTime.now());
        return documentRepository.save(doc);
    }

    @Test
    @org.springframework.test.annotation.DirtiesContext
    void purgeRollbackLeavesProjectAndDocumentsAndNoCleanupTasks() {
        LocalDateTime now = LocalDateTime.now();
        Project project = createScheduledProject(now.minusMinutes(10));
        Document doc = createDocument(project, "documents/paper.tex", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

        // Force delete(project) to fail
        doThrow(new RuntimeException("Simulated database failure during project deletion"))
                .when(projectRepository).delete(any(Project.class));

        assertThatThrownBy(() -> purgeService.purgeIfDue(project.getId(), now))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Simulated database failure");

        // Reset mock
        reset(projectRepository);

        // Verify rollback: project and document still exist
        assertThat(projectRepository.findById(project.getId())).isPresent();
        assertThat(documentRepository.findById(doc.getId())).isPresent();
        assertThat(cleanupTaskRepository.findByProjectId(project.getId())).isEmpty();
    }

    @Test
    void committedPurgePersistsCleanupTasksAndCleanupServiceDeletesThem() {
        LocalDateTime now = LocalDateTime.now();
        Project project = createScheduledProject(now.minusMinutes(10));
        Document doc = createDocument(project, "documents/paper.tex", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

        boolean purged = purgeService.purgeIfDue(project.getId(), now);
        assertThat(purged).isTrue();

        // Project and doc removed from DB
        assertThat(projectRepository.findById(project.getId())).isEmpty();
        assertThat(documentRepository.findById(doc.getId())).isEmpty();

        // Tasks committed and available
        List<ProjectDeletionCleanupTask> tasks = cleanupTaskRepository.findByProjectId(project.getId());
        assertThat(tasks).isNotEmpty();

        // Process each task via cleanupService
        for (ProjectDeletionCleanupTask task : tasks) {
            boolean cleaned = cleanupService.cleanupOne(task.getId(), now.plusMinutes(1));
            assertThat(cleaned).isTrue();
        }

        // All tasks should now be deleted from repo
        assertThat(cleanupTaskRepository.findByProjectId(project.getId())).isEmpty();
    }
}
