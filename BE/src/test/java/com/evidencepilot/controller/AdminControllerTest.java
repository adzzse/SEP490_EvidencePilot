package com.evidencepilot.controller;

import com.evidencepilot.dto.request.AdminBroadcastRequest;
import com.evidencepilot.dto.request.AdminUserCreateRequest;
import com.evidencepilot.dto.request.AdminUserImportRequest;
import com.evidencepilot.dto.request.AdminUserStatusRequest;
import com.evidencepilot.dto.response.AdminUserImportResponse;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.service.AdminService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class AdminControllerTest {

    private final AdminService service = mock(AdminService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = standaloneSetup(new AdminController(service, new ObjectMapper())).build();
    }

    @Test
    void controllerRequiresAdminRoleAtClassBoundary() {
        PreAuthorize annotation = AdminController.class.getAnnotation(PreAuthorize.class);
        assertThat(annotation).isNotNull();
        assertThat(annotation.value()).isEqualTo("hasRole('ADMIN')");
    }

    @Test
    void listUsersBindsFiltersAndReturnsOk() throws Exception {
        mockMvc.perform(get("/api/admin/users")
                        .param("page", "2").param("size", "5")
                        .param("sort", "email,asc").param("q", "lin")
                        .param("role", "STUDENT").param("status", "DELETED"))
                .andExpect(status().isOk());
        verify(service).getUsers(2, 5, "email,asc", "lin", UserRole.STUDENT, AccountStatus.DELETED);
    }

    @Test
    void createUserBindsRequestAndReturnsCreated() throws Exception {
        mockMvc.perform(post("/api/admin/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"new@example.com\",\"firstName\":\"New\",\"lastName\":\"User\",\"role\":\"INSTRUCTOR\",\"devBypass\":false}"))
                .andExpect(status().isCreated());
        verify(service).createUser(any(AdminUserCreateRequest.class));
    }

    @Test
    void createUserBindsDevBypassFlag() throws Exception {
        mockMvc.perform(post("/api/admin/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"new@example.com\",\"firstName\":\"New\",\"lastName\":\"User\",\"role\":\"INSTRUCTOR\",\"devBypass\":true}"))
                .andExpect(status().isCreated());
        verify(service).createUser(argThat(req -> req.devBypass()));
    }

    @Test
    void importUsersBindsRequestAndReturnsCreated() throws Exception {
        when(service.importUsers(any(AdminUserImportRequest.class)))
                .thenReturn(new AdminUserImportResponse(1, 0, List.of()));
        mockMvc.perform(post("/api/admin/users/import")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"STUDENT\",\"users\":[{\"email\":\"new@example.com\",\"firstName\":\"New\",\"lastName\":\"User\",\"studentCode\":\"SE170608\"}]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.created").value(1));
        verify(service).importUsers(any(AdminUserImportRequest.class));
    }

    @Test
    void malformedImportReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/admin/users/import")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not-json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("body"));
    }

    @Test
    void updateStatusBindsRequestAndReturnsOk() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(patch("/api/admin/users/{id}/status", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"BANNED\"}"))
                .andExpect(status().isOk());
        verify(service).updateStatus(eq(id), any(AdminUserStatusRequest.class));
    }

    @Test
    void deleteUserReturnsNoContent() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(delete("/api/admin/users/{id}", id)).andExpect(status().isNoContent());
        verify(service).deleteUser(id);
    }

    @Test
    void requestPasswordResetReturnsAccepted() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(post("/api/admin/users/{id}/password-reset", id)).andExpect(status().isAccepted());
        verify(service).requestPasswordReset(id);
    }

    @Test
    void dashboardAuditAndBroadcastRoutesDelegate() throws Exception {
        mockMvc.perform(get("/api/admin/dashboard")).andExpect(status().isOk());
        verify(service).getDashboard();

        UUID actorId = UUID.randomUUID();
        UUID entityId = UUID.randomUUID();
        mockMvc.perform(get("/api/admin/audit-logs")
                        .param("page", "1").param("size", "10")
                        .param("actorId", actorId.toString())
                        .param("entityType", "USER").param("entityId", entityId.toString()))
                .andExpect(status().isOk());
        verify(service).getAuditLogs(1, 10, actorId, "USER", entityId);

        org.mockito.Mockito.when(service.broadcast(any(AdminBroadcastRequest.class))).thenReturn(2L);
        mockMvc.perform(post("/api/admin/notifications/broadcast")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"Maintenance soon\",\"role\":\"STUDENT\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recipientCount").value(2));
    }

    @Test
    void documentCountsBindsFiltersAndReturnsCounts() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID collectionId = UUID.randomUUID();
        when(service.getDocumentCounts("query", projectId, collectionId))
                .thenReturn(Map.of("total", 1201L, "processed", 1100L, "failed", 12L));

        mockMvc.perform(get("/api/admin/documents/counts")
                        .param("q", "query")
                        .param("projectId", projectId.toString())
                        .param("collectionId", collectionId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1201))
                .andExpect(jsonPath("$.processed").value(1100))
                .andExpect(jsonPath("$.failed").value(12));
        verify(service).getDocumentCounts("query", projectId, collectionId);
    }
}
