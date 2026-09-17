package com.evidencepilot.exception;

import com.evidencepilot.client.openalex.OpenAlexClient;
import com.evidencepilot.config.security.JwtSessionRegistry;
import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.controller.GlobalExceptionHandler;
import com.evidencepilot.dto.response.ApiErrorResponse;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.HealthService;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.core.MethodParameter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Transactional
class GlobalExceptionHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private JwtSessionRegistry sessionRegistry;

    @MockBean(name = "minioClient")
    private MinioClient minioClient;

    @MockBean
    private RabbitTemplate rabbitTemplate;

    @MockBean
    private AiModelClient aiModelClient;

    @MockBean
    private HealthService healthService;

    private String bearerToken;

    private String issueToken(User user) {
        String token = jwtUtils.generateToken(user);
        sessionRegistry.register(jwtUtils.extractJti(token));
        return token;
    }

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setEmail("exceptiontest@test.com");
        user.setPasswordHash("encoded-placeholder");
        user.setRole(UserRole.STUDENT);
        user.setFirstName("Exception");
        user.setLastName("Test");
        user.setCreatedAt(LocalDateTime.now());
        user = userRepository.saveAndFlush(user);

        bearerToken = "Bearer " + issueToken(user);
        when(aiModelClient.health()).thenReturn(Map.of("status", "ok"));
        when(healthService.checkReadiness()).thenReturn(Map.of("status", "UP"));
    }

    @Test
    void getNonExistentProject_shouldReturn404WithApiErrorResponse() throws Exception {
        UUID missingUuid = UUID.randomUUID();

        mockMvc.perform(get("/api/projects/{id}", missingUuid)
                        .header("Authorization", bearerToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.timestamp", not(blankString())))
                .andExpect(jsonPath("$.status", is(404)))
                .andExpect(jsonPath("$.error", not(blankString())))
                .andExpect(jsonPath("$.message", containsString(missingUuid.toString())))
                .andExpect(jsonPath("$.path", is("/api/projects/" + missingUuid)));
    }

    @Test
    void securityConfig_allowsPublicHealthAndOptions() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/health/live"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/health/ready"))
                .andExpect(status().isOk());
        mockMvc.perform(options("/api/projects"))
                .andExpect(status().isOk());
    }

    @Test
    void securityConfig_deniesAnonymousProtectedRouteWith401AndStudentAdminRouteWith403() throws Exception {
        mockMvc.perform(get("/api/projects"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status", is(401)))
                .andExpect(jsonPath("$.error", is("Unauthorized")))
                .andExpect(jsonPath("$.message", not(blankString())))
                .andExpect(jsonPath("$.path", is("/api/projects")));
        mockMvc.perform(get("/api/users/{id}", UUID.randomUUID())
                        .header("Authorization", bearerToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void securityConfig_allowsAuthenticatedProfileAndAdminUserLookup() throws Exception {
        User admin = new User();
        admin.setEmail("admin-exceptiontest@test.com");
        admin.setPasswordHash("encoded-placeholder");
        admin.setRole(UserRole.ADMIN);
        admin.setFirstName("Admin");
        admin.setLastName("Test");
        admin.setCreatedAt(LocalDateTime.now());
        admin = userRepository.saveAndFlush(admin);

        mockMvc.perform(get("/api/users/profile")
                        .header("Authorization", bearerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email", is("exceptiontest@test.com")));
        mockMvc.perform(get("/api/users/{id}", admin.getId())
                        .header("Authorization", "Bearer " + issueToken(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(admin.getId().toString())));
    }

    @Test
    void handleValidation_returnsFieldErrorsAndRequestPath() {
        BeanPropertyBindingResult bindingResult = new BeanPropertyBindingResult(new Object(), "request");
        bindingResult.addError(new FieldError("request", "email", "must be valid"));
        bindingResult.addError(new FieldError("request", "email", "must not be blank"));
        MethodArgumentNotValidException exception =
                new MethodArgumentNotValidException(mock(MethodParameter.class), bindingResult);

        ResponseEntity<ApiErrorResponse> response = handler().handleValidation(exception, request("/api/admin/users"));

        assertError(response, HttpStatus.BAD_REQUEST, "Validation failed", "/api/admin/users");
        assertThat(response.getBody().fieldErrors()).containsExactlyEntriesOf(java.util.Map.of("email", "must be valid"));
    }

    @Test
    void handleMissingParameter_returnsBadRequest() {
        MissingServletRequestParameterException exception =
                new MissingServletRequestParameterException("token", "String");

        ResponseEntity<ApiErrorResponse> response = handler().handleMissingParameter(exception, request("/api/documents/lookup"));

        assertError(response, HttpStatus.BAD_REQUEST, exception.getMessage(), "/api/documents/lookup");
    }

    @Test
    void handleResourceNotFound_returnsNotFound() {
        ResponseEntity<ApiErrorResponse> response = handler().handleResourceNotFound(
                new ResourceNotFoundException("missing"), request("/api/projects/missing"));

        assertError(response, HttpStatus.NOT_FOUND, "missing", "/api/projects/missing");
    }

    @Test
    void handleResponseStatus_usesReasonOrDefaultReasonPhrase() {
        ResponseEntity<ApiErrorResponse> withReason = handler().handleResponseStatus(
                new ResponseStatusException(HttpStatus.FORBIDDEN, "read-only"), request("/api/projects/1"));
        ResponseEntity<ApiErrorResponse> withoutReason = handler().handleResponseStatus(
                new ResponseStatusException(HttpStatus.CONFLICT), request("/api/projects/1"));

        assertError(withReason, HttpStatus.FORBIDDEN, "read-only", "/api/projects/1");
        assertError(withoutReason, HttpStatus.CONFLICT, "Conflict", "/api/projects/1");
    }

    @Test
    void handleAiValidation_returnsBadGateway() {
        ResponseEntity<ApiErrorResponse> response = handler().handleAiValidation(
                new AiValidationException("invalid verdict"), request("/api/papers/1/sections/2/review"));

        assertError(response, HttpStatus.BAD_GATEWAY, "invalid verdict", "/api/papers/1/sections/2/review");
    }

    @Test
    void handleAiApi_preservesStatusCode() {
        var rateLimited = new AiModelClient.AiApiException("/generate", 429);
        var badGateway = new AiModelClient.AiApiException("/generate", 502);
        var unavailable = new AiModelClient.AiApiException("/generate", 503);

        assertError(handler().handleAiApi(rateLimited, request("/api/papers/1/sections/2/review")),
                HttpStatus.TOO_MANY_REQUESTS, rateLimited.getMessage(), "/api/papers/1/sections/2/review");
        assertError(handler().handleAiApi(badGateway, request("/api/papers/1/sections/2/review")),
                HttpStatus.BAD_GATEWAY, badGateway.getMessage(), "/api/papers/1/sections/2/review");
        assertError(handler().handleAiApi(unavailable, request("/api/papers/1/sections/2/review")),
                HttpStatus.SERVICE_UNAVAILABLE, unavailable.getMessage(), "/api/papers/1/sections/2/review");
        var coded = new AiModelClient.AiApiException("/ai/generate", 429, "GENERATION_QUOTA_EXCEEDED",
                "GENERATION_QUOTA_EXCEEDED", 7_001L, null);
        var response = handler().handleAiApi(coded, request("/api/papers/1/sections/2/review"));
        assertThat(response.getBody().fieldErrors()).containsEntry("code", "GENERATION_QUOTA_EXCEEDED");
        assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("8");
    }

    @Test
    void handleOpenAlexApi_mapsClientUpstreamAndUnknownStatuses() {
        var malformed = new OpenAlexClient.OpenAlexApiException("Invalid DOI: nope", 400);
        var notFound = new OpenAlexClient.OpenAlexApiException("OpenAlex lookup failed for DOI: x (HTTP 404)", 404);
        var upstream = new OpenAlexClient.OpenAlexApiException("OpenAlex lookup failed for DOI: x (HTTP 429)", 429);
        var network = new OpenAlexClient.OpenAlexApiException("OpenAlex lookup failed for DOI: x", new RuntimeException("boom"));

        assertError(handler().handleOpenAlexApi(malformed, request("/api/documents/ingest/doi")),
                HttpStatus.BAD_REQUEST, malformed.getMessage(), "/api/documents/ingest/doi");
        assertError(handler().handleOpenAlexApi(notFound, request("/api/documents/ingest/doi")),
                HttpStatus.NOT_FOUND, notFound.getMessage(), "/api/documents/ingest/doi");
        assertError(handler().handleOpenAlexApi(upstream, request("/api/documents/ingest/doi")),
                HttpStatus.BAD_GATEWAY, upstream.getMessage(), "/api/documents/ingest/doi");
        assertError(handler().handleOpenAlexApi(network, request("/api/documents/ingest/doi")),
                HttpStatus.BAD_GATEWAY, network.getMessage(), "/api/documents/ingest/doi");
    }

    @Test
    void handleDataIntegrity_returnsConflictWithoutDatabaseDetails() {
        ResponseEntity<ApiErrorResponse> response = handler().handleDataIntegrity(
                new DataIntegrityViolationException("constraint users_email_key"), request("/api/admin/users"));

        assertError(response, HttpStatus.CONFLICT, "Request conflicts with existing data.", "/api/admin/users");
    }

    @Test
    void handleMultipart_mapsMultipartAndMaximumSizeFailures() {
        ResponseEntity<ApiErrorResponse> multipart = handler().handleMultipart(
                new MultipartException("broken boundary"), request("/api/documents"));
        ResponseEntity<ApiErrorResponse> oversized = handler().handleMultipart(
                new MaxUploadSizeExceededException(10), request("/api/documents"));

        assertError(multipart, HttpStatus.BAD_REQUEST, "File upload failed.", "/api/documents");
        assertError(oversized, HttpStatus.BAD_REQUEST, "File upload failed.", "/api/documents");
    }

    private GlobalExceptionHandler handler() {
        return new GlobalExceptionHandler();
    }

    private MockHttpServletRequest request(String path) {
        return new MockHttpServletRequest("GET", path);
    }

    private void assertError(ResponseEntity<ApiErrorResponse> response, HttpStatus status,
                             String message, String path) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().status()).isEqualTo(status.value());
        assertThat(response.getBody().error()).isEqualTo(status.getReasonPhrase());
        assertThat(response.getBody().message()).isEqualTo(message);
        assertThat(response.getBody().path()).isEqualTo(path);
        assertThat(response.getBody().timestamp()).isNotNull();
    }
}
