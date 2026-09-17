package com.evidencepilot.controller;

import com.evidencepilot.config.security.JwtSessionRegistry;
import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.dto.response.OpenAlexPreview;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.impl.OpenAlexIngestionServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class OpenAlexControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private DocumentRepository documentRepository;

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private JwtSessionRegistry sessionRegistry;

    @MockBean
    private OpenAlexIngestionServiceImpl ingestionService;

    @MockBean
    private RabbitTemplate rabbitTemplate;

    private String bearerToken;

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setEmail("openalex-test@test.com");
        user.setPasswordHash("encoded-placeholder");
        user.setRole(UserRole.STUDENT);
        user.setFirstName("Test");
        user.setLastName("User");
        user.setCreatedAt(LocalDateTime.now());
        user = userRepository.saveAndFlush(user);

        bearerToken = "Bearer " + issueToken(user);
    }

    private String issueToken(User user) {
        String token = jwtUtils.generateToken(user);
        sessionRegistry.register(jwtUtils.extractJti(token));
        return token;
    }

    @AfterEach
    void cleanUp() {
        documentRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void lookupByDoi_returnsPreview() throws Exception {
        var preview = new OpenAlexPreview(
                "Test Paper", 2024, "Test Publisher",
                List.of("Alice Smith"), "https://example.com/paper.pdf", true);

        when(ingestionService.lookupByDoi("10.1000/xyz")).thenReturn(preview);

        mockMvc.perform(post("/api/documents/lookup")
                        .header("Authorization", bearerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"doi\": \"10.1000/xyz\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Test Paper"))
                .andExpect(jsonPath("$.publicationYear").value(2024))
                .andExpect(jsonPath("$.hasPdf").value(true));
    }

    @Test
    void lookupByDoi_withEmptyDoi_returns400() throws Exception {
        mockMvc.perform(post("/api/documents/lookup")
                        .header("Authorization", bearerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"doi\": \"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void lookupByDoi_withMissingDoi_returns400() throws Exception {
        mockMvc.perform(post("/api/documents/lookup")
                        .header("Authorization", bearerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ingestByDoi_returns202() throws Exception {
        mockMvc.perform(post("/api/documents/ingest/doi")
                        .header("Authorization", bearerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"doi\": \"10.1000/xyz\", \"projectId\": \"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isAccepted());
    }

    @Test
    void ingestByDoi_withoutProjectId_returns200() throws Exception {
        mockMvc.perform(post("/api/documents/ingest/doi")
                        .header("Authorization", bearerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"doi\": \"10.1000/xyz\", \"collectionId\": \"00000000-0000-0000-0000-000000000000\"}"))
                .andExpect(status().isAccepted());
    }
}
