package com.evidencepilot.controller;

import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.PasswordResetService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.minio.MinioClient;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.hamcrest.Matchers.blankOrNullString;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Transactional
class AuthControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JwtUtils jwtUtils;
    @Autowired ObjectMapper objectMapper;

    @MockBean PasswordResetService passwordResetService;
    @MockBean(name = "minioClient") MinioClient minioClient;
    @MockBean RabbitTemplate rabbitTemplate;

    @Test
    void removedRegistrationAndVerificationEndpointsAreNotPublic() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/auth/verify-email").param("token", "old-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginReturnsPasswordNoticeOnlyOnce() throws Exception {
        User user = saveUser("loginuser@test.com", "ValidPass1!", UserRole.INSTRUCTOR);
        user.setPasswordChangeNoticePending(true);
        userRepository.saveAndFlush(user);
        String body = "{\"email\":\"loginuser@test.com\",\"password\":\"ValidPass1!\"}";

        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", not(blankOrNullString())))
                .andExpect(jsonPath("$.user.role", is("INSTRUCTOR")))
                .andExpect(jsonPath("$.user.emailVerified").doesNotExist())
                .andExpect(jsonPath("$.passwordChangeNotice", is(true)));

        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passwordChangeNotice", is(false)));
    }

    @Test
    void updatePasswordInvalidatesOldJwtAndRequiresNewPassword() throws Exception {
        saveUser("student@test.com", "CurrentPass1!", UserRole.STUDENT);
        String loginBody = "{\"email\":\"student@test.com\",\"password\":\"CurrentPass1!\"}";
        String loginJson = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(loginBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = objectMapper.readTree(loginJson).path("token").asText();

        mockMvc.perform(post("/api/auth/update-password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"CurrentPass1!\",\"newPassword\":\"NewStrongPass1!\"}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/users/profile").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"student@test.com\",\"password\":\"NewStrongPass1!\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void passwordResetRequestAlwaysReturnsSameAcceptedResponse() throws Exception {
        org.mockito.Mockito.doThrow(new IllegalStateException("mail unavailable"))
                .when(passwordResetService).requestReset("student@test.com");

        mockMvc.perform(post("/api/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"student@test.com\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.message", is("If the account is eligible, a password reset email will be sent")));
    }

    @Test
    void passwordResetConfirmIsPublic() throws Exception {
        mockMvc.perform(post("/api/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"raw-token\",\"newPassword\":\"NewStrongPass1!\"}"))
                .andExpect(status().isOk());

        verify(passwordResetService).confirmReset("raw-token", "NewStrongPass1!");
    }

    @Test
    void publicPasswordResetPathsIgnoreStaleBearerToken() throws Exception {
        User user = saveUser("banned@test.com", "ValidPass1!", UserRole.STUDENT);
        String staleToken = jwtUtils.generateToken(user);
        user.setAccountStatus(AccountStatus.BANNED);
        user.setTokenVersion(1);
        userRepository.saveAndFlush(user);

        mockMvc.perform(post("/api/auth/password-reset/request")
                        .header("Authorization", "Bearer " + staleToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"banned@test.com\"}"))
                .andExpect(status().isAccepted());
        mockMvc.perform(post("/api/auth/password-reset/confirm")
                        .header("Authorization", "Bearer " + staleToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"raw-token\",\"newPassword\":\"NewStrongPass1!\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void setPasswordAcceptsValidInvitationAndActivatesAccount() throws Exception {
        User user = saveUser("invited@test.com", "ValidPass1!", UserRole.STUDENT);
        user.setPasswordHash(User.DISABLED_PASSWORD_SENTINEL);
        user.setAccountStatus(AccountStatus.VERIFYING_EMAIL);
        user.setEmailVerificationToken("invite-token-1");
        user.setEmailVerificationExpiresAt(java.time.LocalDateTime.now().plusHours(1));
        userRepository.saveAndFlush(user);

        mockMvc.perform(post("/api/auth/set-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"invite-token-1\",\"newPassword\":\"NewStrongPass1!\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"invited@test.com\",\"password\":\"NewStrongPass1!\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void setPasswordRejectsExpiredInvitation() throws Exception {
        User user = saveUser("expired@test.com", "ValidPass1!", UserRole.STUDENT);
        user.setPasswordHash(User.DISABLED_PASSWORD_SENTINEL);
        user.setAccountStatus(AccountStatus.VERIFYING_EMAIL);
        user.setEmailVerificationToken("invite-token-old");
        user.setEmailVerificationExpiresAt(java.time.LocalDateTime.now().minusMinutes(1));
        userRepository.saveAndFlush(user);

        mockMvc.perform(post("/api/auth/set-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"invite-token-old\",\"newPassword\":\"NewStrongPass1!\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loginRejectsSentinelHashAccounts() throws Exception {
        User user = saveUser("pending@test.com", "ValidPass1!", UserRole.STUDENT);
        user.setPasswordHash(User.DISABLED_PASSWORD_SENTINEL);
        user.setAccountStatus(AccountStatus.VERIFYING_EMAIL);
        userRepository.saveAndFlush(user);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"pending@test.com\",\"password\":\"anything\"}"))
                .andExpect(status().isForbidden());
    }

    private User saveUser(String email, String rawPassword, UserRole role) {
        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        user.setRole(role);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setFirstName("Test");
        user.setLastName("User");
        user.setCreatedAt(LocalDateTime.now());
        return userRepository.saveAndFlush(user);
    }
}
