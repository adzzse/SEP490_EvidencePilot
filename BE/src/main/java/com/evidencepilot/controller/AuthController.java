package com.evidencepilot.controller;

import com.evidencepilot.dto.request.LoginRequest;
import com.evidencepilot.dto.request.PasswordResetConfirmRequest;
import com.evidencepilot.dto.request.PasswordResetRequest;
import com.evidencepilot.dto.request.SetPasswordRequest;
import com.evidencepilot.dto.request.UpdatePasswordRequest;
import com.evidencepilot.dto.response.AuthResponse;
import com.evidencepilot.service.AuthService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.PasswordResetService;
import com.evidencepilot.service.UserInvitationService;
import lombok.extern.slf4j.Slf4j;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Authentication", description = "Login and password management")
public class AuthController {

    private final AuthService authService;
    private final CurrentUserService currentUserService;
    private final PasswordResetService passwordResetService;
    private final UserInvitationService userInvitationService;

    private static final Map<String, String> RESET_REQUEST_RESPONSE = Map.of(
            "message", "If the account is eligible, a password reset email will be sent");

    @Operation(summary = "Authenticate user", description = "Validates credentials and returns a signed JWT. Public endpoint.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Login successful"),
            @ApiResponse(responseCode = "401", description = "Invalid credentials")
    })
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @Operation(summary = "Refresh access token",
            description = "Exchanges a still-valid JWT for a fresh one and revokes the old session. "
                    + "Race-free: concurrent refreshes with the same token yield one success.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Token refreshed"),
            @ApiResponse(responseCode = "401", description = "Missing, invalid, expired, or revoked token")
    })
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String token = authHeader != null && authHeader.startsWith("Bearer ")
                ? authHeader.substring(7) : null;
        return ResponseEntity.ok(authService.refresh(token));
    }

    @PostMapping("/update-password")
    public ResponseEntity<Void> updatePassword(@Valid @RequestBody UpdatePasswordRequest request) {
        authService.updatePassword(currentUserService.requireCurrentUser().getId(), request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password-reset/request")
    public ResponseEntity<Map<String, String>> requestPasswordReset(
            @Valid @RequestBody PasswordResetRequest request) {
        try {
            passwordResetService.requestReset(request.getEmail());
        } catch (RuntimeException exception) {
            log.warn("Public password reset request failed", exception);
        }
        return ResponseEntity.accepted().body(RESET_REQUEST_RESPONSE);
    }

    @PostMapping("/password-reset/confirm")
    public ResponseEntity<Map<String, String>> confirmPasswordReset(
            @Valid @RequestBody PasswordResetConfirmRequest request) {
        passwordResetService.confirmReset(request.getToken(), request.getNewPassword());
        return ResponseEntity.ok(Map.of("message", "Password reset successfully"));
    }

    @Operation(summary = "Accept email-verification invitation",
            description = "Consumes a set-password invitation token issued for a VERIFYING_EMAIL account "
                    + "and sets the user's own password. Token expiry is validated at request time. Public endpoint.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Password set, account activated"),
            @ApiResponse(responseCode = "400", description = "Invalid or expired token")
    })
    @PostMapping("/set-password")
    public ResponseEntity<Map<String, String>> acceptInvitation(
            @Valid @RequestBody SetPasswordRequest request) {
        userInvitationService.acceptInvitation(request.token(), request.newPassword());
        return ResponseEntity.ok(Map.of("message", "Password set successfully. You can now sign in."));
    }
}
