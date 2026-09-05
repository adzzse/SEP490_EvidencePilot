package com.evidencepilot.controller;

import com.evidencepilot.dto.request.UserProfileUpdateRequest;
import com.evidencepilot.dto.response.UserResponse;
import com.evidencepilot.model.User;
import com.evidencepilot.service.ActivityFeedService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class UserControllerTest {

    private final UserService userService = mock(UserService.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final com.evidencepilot.service.EmailVerificationService emailVerificationService = mock(com.evidencepilot.service.EmailVerificationService.class);
    private final ActivityFeedService activityFeedService = mock(ActivityFeedService.class);
    private final com.evidencepilot.service.UserAvatarService userAvatarService = mock(com.evidencepilot.service.UserAvatarService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = standaloneSetup(new UserController(userService, currentUserService, emailVerificationService, activityFeedService, userAvatarService)).build();
    }

    @Test
    void findById_delegatesToService() throws Exception {
        UUID id = UUID.randomUUID();

        mockMvc.perform(get("/api/users/{id}", id))
                .andExpect(status().isOk());

        verify(userService).findUserById(id);
    }

    @Test
    void profile_mapsCurrentUser() throws Exception {
        User user = new User();
        when(currentUserService.requireCurrentUser()).thenReturn(user);

        mockMvc.perform(get("/api/users/profile"))
                .andExpect(status().isOk());

        verify(currentUserService).requireCurrentUser();
    }

    @Test
    void updateProfile_usesCurrentUserId() throws Exception {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(userService.updateUserProfile(eq(id), any(UserProfileUpdateRequest.class), isNull()))
                .thenReturn(UserResponse.builder().id(id).email("ada@example.com").build());

        mockMvc.perform(put("/api/users/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\"}"))
                .andExpect(status().isOk());

        verify(userService).updateUserProfile(eq(id), any(UserProfileUpdateRequest.class), isNull());
    }

    @Test
    void updateProfile_passesClaimHeaderThrough() throws Exception {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(userService.updateUserProfile(eq(id), any(UserProfileUpdateRequest.class), eq("claim-token-123")))
                .thenReturn(UserResponse.builder().id(id).email("new@example.com").build());

        mockMvc.perform(put("/api/users/profile")
                        .header("X-Email-Otp-Claim", "claim-token-123")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"firstName\":\"Ada\",\"email\":\"new@example.com\"}"))
                .andExpect(status().isOk());

        verify(userService).updateUserProfile(eq(id), any(UserProfileUpdateRequest.class), eq("claim-token-123"));
    }

    @Test
    void updateProfile_rejectsOversizedName() throws Exception {
        mockMvc.perform(put("/api/users/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"firstName\":\"" + "a".repeat(101) + "\"}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(userService, currentUserService);
    }

    @Test
    void getMyActivity_delegatesToService() throws Exception {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        when(currentUserService.requireCurrentUser()).thenReturn(user);

        mockMvc.perform(get("/api/users/me/activity"))
                .andExpect(status().isOk());

        verify(activityFeedService).getMyActivity(eq(id), eq(20));
    }

    @Test
    void getMyActivity_honorsLimitParam() throws Exception {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        when(currentUserService.requireCurrentUser()).thenReturn(user);

        mockMvc.perform(get("/api/users/me/activity").param("limit", "50"))
                .andExpect(status().isOk());

        verify(activityFeedService).getMyActivity(eq(id), eq(50));
    }

    @Test
    void profile_includesResolvedAvatarUrl() throws Exception {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setAvatarKey("avatars/" + id + ".jpg");
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(userAvatarService.resolveAvatarUrl(user)).thenReturn("https://cdn.example/avatars/x.jpg");

        mockMvc.perform(get("/api/users/profile"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").value("https://cdn.example/avatars/x.jpg"));
    }

    @Test
    void uploadAvatar_delegatesToService() throws Exception {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(userAvatarService.uploadAvatar(eq(id), any())).thenReturn("https://cdn.example/avatars/x.jpg");

        MockMultipartFile file = new MockMultipartFile("file", "me.jpg", "image/jpeg", new byte[]{1, 2, 3});
        mockMvc.perform(multipart("/api/users/avatar").file(file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").value("https://cdn.example/avatars/x.jpg"));

        verify(userAvatarService).uploadAvatar(eq(id), any());
    }
}
