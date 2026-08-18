package com.evidencepilot.controller;

import com.evidencepilot.dto.request.UserProfileUpdateRequest;
import com.evidencepilot.model.User;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class UserControllerTest {

    private final UserService userService = mock(UserService.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = standaloneSetup(new UserController(userService, currentUserService)).build();
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

        mockMvc.perform(put("/api/users/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\"}"))
                .andExpect(status().isOk());

        verify(userService).updateUserProfile(eq(id), any(UserProfileUpdateRequest.class));
    }

    @Test
    void updateProfile_rejectsOversizedName() throws Exception {
        mockMvc.perform(put("/api/users/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"firstName\":\"" + "a".repeat(101) + "\"}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(userService, currentUserService);
    }
}
