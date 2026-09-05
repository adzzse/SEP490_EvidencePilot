package com.evidencepilot.controller;

import com.evidencepilot.dto.request.EmailOtpRequest;
import com.evidencepilot.dto.request.EmailOtpVerifyRequest;
import com.evidencepilot.dto.response.EmailOtpRequestResponse;
import com.evidencepilot.dto.response.EmailOtpVerifyResponse;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.EmailOtpService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/users/email/otp")
@RequiredArgsConstructor
@Tag(name = "Email OTP", description = "6-digit verification codes for email address changes")
public class OtpController {

    private final EmailOtpService emailOtpService;
    private final CurrentUserService currentUserService;

    @Operation(summary = "Request a 6-digit OTP for email change")
    @PostMapping("/request")
    public ResponseEntity<EmailOtpRequestResponse> requestOtp(@Valid @RequestBody EmailOtpRequest request) {
        UUID userId = currentUserService.requireCurrentUser().getId();
        return ResponseEntity.accepted().body(emailOtpService.requestOtp(userId, request.email()));
    }

    @Operation(summary = "Verify a 6-digit OTP and receive a one-shot claim token")
    @PostMapping("/verify")
    public ResponseEntity<EmailOtpVerifyResponse> verifyOtp(@Valid @RequestBody EmailOtpVerifyRequest request) {
        UUID userId = currentUserService.requireCurrentUser().getId();
        return ResponseEntity.ok(emailOtpService.verifyOtp(userId, request.email(), request.code()));
    }
}
