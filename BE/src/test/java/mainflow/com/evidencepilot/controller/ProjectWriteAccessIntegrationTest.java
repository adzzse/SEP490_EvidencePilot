package com.evidencepilot.controller;

import com.evidencepilot.config.security.JwtSessionRegistry;
import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Transactional
class ProjectWriteAccessIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectMemberRepository projectMemberRepository;

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private JwtSessionRegistry sessionRegistry;

    @MockBean(name = "minioClient")
    private MinioClient minioClient;

    @MockBean
    private RabbitTemplate rabbitTemplate;

    private User currentUser;
    private String bearerToken;
    private UUID projectId;

    @BeforeEach
    void setUp() {
        currentUser = null;
        bearerToken = null;
        projectId = null;
    }

    @Test
    void studentOwnsProjectInProgress_shouldReturn200() throws Exception {
        givenStudentOwnsProject(ProjectStatus.IN_PROGRESS);

        mockMvc.perform(put("/api/projects/{id}", projectId)
                .header("Authorization", bearerToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"title":"Updated Title","description":"Updated","targetStandard":"CUSTOM"}
                        """))
                .andExpect(status().isOk());
    }

    @Test
    void studentOwnsProjectSubmittedForReview_shouldReturn409() throws Exception {
        givenStudentOwnsProject(ProjectStatus.SUBMITTED_FOR_REVIEW);

        mockMvc.perform(put("/api/projects/{id}", projectId)
                .header("Authorization", bearerToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"title":"Updated Title","description":"Updated","targetStandard":"CUSTOM"}
                        """))
                .andExpect(status().isConflict());
    }

    @Test
    void studentOwnsProjectApproved_shouldReturn409() throws Exception {
        givenStudentOwnsProject(ProjectStatus.APPROVED);

        mockMvc.perform(put("/api/projects/{id}", projectId)
                .header("Authorization", bearerToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"title":"Updated Title","description":"Updated","targetStandard":"CUSTOM"}
                        """))
                .andExpect(status().isConflict());
    }

    @Test
    void studentDoesNotOwnProject_shouldReturn403() throws Exception {
        User owner = createAndSaveUser(UserRole.STUDENT);
        Project project = createAndSaveProject(ProjectStatus.IN_PROGRESS, owner);
        projectId = project.getId();

        currentUser = createAndSaveUser(UserRole.STUDENT);
        bearerToken = "Bearer " + issueToken(currentUser);

        mockMvc.perform(put("/api/projects/{id}", projectId)
                .header("Authorization", bearerToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"title":"Updated Title","description":"Updated","targetStandard":"CUSTOM"}
                        """))
                .andExpect(status().isForbidden());
    }

    @Test
    void instructorAttemptsMutation_shouldReturn403() throws Exception {
        User owner = createAndSaveUser(UserRole.STUDENT);
        Project project = createAndSaveProject(ProjectStatus.IN_PROGRESS, owner);
        projectId = project.getId();

        currentUser = createAndSaveUser(UserRole.INSTRUCTOR);
        bearerToken = "Bearer " + issueToken(currentUser);

        mockMvc.perform(put("/api/projects/{id}", projectId)
                .header("Authorization", bearerToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"title":"Updated Title","description":"Updated","targetStandard":"CUSTOM"}
                        """))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminMutatesSubmittedProject_shouldReturn200() throws Exception {
        User owner = createAndSaveUser(UserRole.STUDENT);
        Project project = createAndSaveProject(ProjectStatus.SUBMITTED_FOR_REVIEW, owner);
        projectId = project.getId();

        currentUser = createAndSaveUser(UserRole.ADMIN);
        bearerToken = "Bearer " + issueToken(currentUser);

        mockMvc.perform(put("/api/projects/{id}", projectId)
                .header("Authorization", bearerToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"title":"Updated Title","description":"Updated","targetStandard":"CUSTOM"}
                        """))
                .andExpect(status().isOk());
    }

    @Test
    void instructorMemberCompletesSubmittedProject_shouldReturn200() throws Exception {
        User owner = createAndSaveUser(UserRole.STUDENT);
        Project project = createAndSaveProject(ProjectStatus.SUBMITTED_FOR_REVIEW, owner);
        projectId = project.getId();

        currentUser = createAndSaveUser(UserRole.INSTRUCTOR);
        addProjectMember(project, currentUser, ProjectRole.INSTRUCTOR);
        bearerToken = "Bearer " + issueToken(currentUser);

        mockMvc.perform(patch("/api/projects/{id}/complete", projectId)
                .header("Authorization", bearerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(ProjectStatus.APPROVED.name()));
    }

    private String issueToken(User user) {
        String token = jwtUtils.generateToken(user);
        sessionRegistry.register(jwtUtils.extractJti(token));
        return token;
    }

    // -- fixture helpers --

    private void givenStudentOwnsProject(ProjectStatus status) {
        currentUser = createAndSaveUser(UserRole.STUDENT);
        Project project = createAndSaveProject(status, currentUser);
        projectId = project.getId();
        bearerToken = "Bearer " + issueToken(currentUser);
    }

    private User createAndSaveUser(UserRole role) {
        User user = new User();
        user.setEmail(UUID.randomUUID() + "@test.com");
        user.setPasswordHash("encoded-placeholder");
        user.setRole(role);
        user.setFirstName("Test");
        user.setLastName("User");
        user.setCreatedAt(LocalDateTime.now());
        return userRepository.saveAndFlush(user);
    }

    private Project createAndSaveProject(ProjectStatus status, User owner) {
        Project project = new Project();
        project.setTitle("Test Project");
        project.setStatus(status);
        project.setCreatedAt(LocalDateTime.now());
        project.setActive(true);
        project = projectRepository.saveAndFlush(project);

        addProjectMember(project, owner, ProjectRole.LEADER);

        return project;
    }

    private void addProjectMember(Project project, User user, ProjectRole role) {
        ProjectMember member = new ProjectMember();
        member.setProject(project);
        member.setUser(user);
        member.setRole(role);
        member.setJoinedAt(LocalDateTime.now());
        projectMemberRepository.saveAndFlush(member);

        if (project.getProjectMembers() == null) {
            project.setProjectMembers(new ArrayList<>());
        }
        project.getProjectMembers().add(member);
    }
}
