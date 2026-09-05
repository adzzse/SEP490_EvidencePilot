package com.evidencepilot.controller;

import com.evidencepilot.dto.response.EmailOtpRequestResponse;
import com.evidencepilot.dto.response.EmailOtpVerifyResponse;
import com.evidencepilot.model.User;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.EmailOtpService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OtpControllerTest {

    private final EmailOtpService emailOtpService = mock(EmailOtpService.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new OtpController(emailOtpService, currentUserService))
            .build();

    @Test
    void requestOtp_returnsAcceptedAndPayload() throws Exception {
        User user = new User();
        user.setId(UUID.randomUUID());
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(emailOtpService.requestOtp(any(), any())).thenReturn(
                new EmailOtpRequestResponse("sent", "new@example.com", LocalDateTime.now().plusSeconds(60)));

        mockMvc.perform(post("/api/users/email/otp/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"new@example.com\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value("new@example.com"));
    }

    @Test
    void requestOtp_rejectsInvalidEmail() throws Exception {
        mockMvc.perform(post("/api/users/email/otp/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"not-an-email\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void verifyOtp_returnsClaimToken() throws Exception {
        User user = new User();
        user.setId(UUID.randomUUID());
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(emailOtpService.verifyOtp(any(), any(), any())).thenReturn(
                new EmailOtpVerifyResponse("verified", "new@example.com", "claim-123", LocalDateTime.now().plusMinutes(10)));

        mockMvc.perform(post("/api/users/email/otp/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"new@example.com\",\"code\":\"123456\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.claimToken").value("claim-123"));
    }

    @Test
    void verifyOtp_rejectsBlankCode() throws Exception {
        mockMvc.perform(post("/api/users/email/otp/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"new@example.com\",\"code\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void verifyOtp_rejectsNonSixDigitCode() throws Exception {
        mockMvc.perform(post("/api/users/email/otp/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"new@example.com\",\"code\":\"12a456\"}"))
                .andExpect(status().isBadRequest());
    }
}
