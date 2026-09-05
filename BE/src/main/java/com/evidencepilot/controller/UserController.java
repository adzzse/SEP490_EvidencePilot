package com.evidencepilot.controller;

import com.evidencepilot.dto.request.EmailChangeRequest;
import com.evidencepilot.dto.request.EmailVerificationConfirmRequest;
import com.evidencepilot.dto.request.UserProfileUpdateRequest;
import com.evidencepilot.dto.response.ActivityFeedResponse;
import com.evidencepilot.dto.response.EmailChangeResponse;
import com.evidencepilot.dto.response.UserResponse;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.service.ActivityFeedService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.EmailVerificationService;
import com.evidencepilot.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "User lookup and profile self-service endpoints")
public class UserController {

    static final String EMAIL_OTP_CLAIM_HEADER = "X-Email-Otp-Claim";

    private final UserService userService;
    private final CurrentUserService currentUserService;
    private final EmailVerificationService emailVerificationService;
    private final ActivityFeedService activityFeedService;

    @Operation(summary = "Get user by ID", description = "Returns a user's profile by UUID. Requires authentication.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "User returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "User not found")
    })
    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> findById(
            @Parameter(description = "User UUID") @PathVariable UUID id) {
        return ResponseEntity.ok(userService.findUserById(id));
    }

    @Operation(summary = "List users by role",
            description = "Returns all users with a given role (STUDENT, INSTRUCTOR, ADMIN). Optional ?q= search filters by name/email.")
    @GetMapping
    public ResponseEntity<List<UserResponse>> findByRole(
            @Parameter(description = "Filter by role") @RequestParam UserRole role,
            @Parameter(description = "Search query (name/email)") @RequestParam(required = false) String q) {
        if (q != null && !q.isBlank()) {
            return ResponseEntity.ok(userService.searchUsersByRole(role, q));
        }
        return ResponseEntity.ok(userService.findUsersByRole(role));
    }

    @Operation(summary = "Get current user profile",
            description = "Returns the profile of the authenticated user. "
                    + "The userId is extracted from the JWT — no path parameter required.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Profile returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT")
    })
    @GetMapping("/profile")
    public ResponseEntity<UserResponse> profile() {
        return ResponseEntity.ok(
                UserResponse.from(currentUserService.requireCurrentUser()));
    }

    @Operation(summary = "Update current user profile",
            description = "Updates the firstName, lastName, and/or email of the authenticated user. "
                    + "The userId is extracted from the JWT. When the email field is changed, the "
                    + "X-Email-Otp-Claim header must carry a valid one-shot claim token issued by "
                    + "POST /api/users/email/otp/verify.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Profile updated"),
            @ApiResponse(responseCode = "400", description = "Validation error"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "403", description = "Email change requires a valid verification claim"),
            @ApiResponse(responseCode = "409", description = "Email already in use by another account")
    })
    @PutMapping("/profile")
    public ResponseEntity<UserResponse> updateProfile(
            @Valid @RequestBody UserProfileUpdateRequest request,
            @Parameter(description = "One-shot claim token from /api/users/email/otp/verify (only required when changing email)")
            @RequestHeader(value = EMAIL_OTP_CLAIM_HEADER, required = false) String emailClaimToken) {
        UUID userId = currentUserService.requireCurrentUser().getId();
        return ResponseEntity.ok(userService.updateUserProfile(userId, request, emailClaimToken));
    }

    @Operation(summary = "Request email address change (token-link flow)",
            description = "Sends a verification email to the new address. The account retains its current email until confirmed.")
    @PostMapping("/email-change/request")
    public ResponseEntity<EmailChangeResponse> requestEmailChange(
            @Valid @RequestBody EmailChangeRequest request) {
        UUID userId = currentUserService.requireCurrentUser().getId();
        return ResponseEntity.accepted().body(emailVerificationService.requestEmailChange(userId, request.newEmail()));
    }

    @Operation(summary = "Confirm email address change (token-link flow)",
            description = "Validates the verification token sent via email and updates the user email.")
    @PostMapping("/email-change/confirm")
    public ResponseEntity<Map<String, String>> confirmEmailChange(
            @Valid @RequestBody EmailVerificationConfirmRequest request) {
        emailVerificationService.confirmEmailChange(request.token());
        return ResponseEntity.ok(Map.of("message", "Email address updated successfully"));
    }

    @Operation(summary = "Cancel pending email address change (token-link flow)",
            description = "Cancels any outstanding email change request and removes the pending verification token.")
    @DeleteMapping("/email-change/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelEmailChange() {
        UUID userId = currentUserService.requireCurrentUser().getId();
        emailVerificationService.cancelEmailChange(userId);
    }

    @Operation(summary = "Get current user activity feed",
            description = "Returns role-branched recent activity (projects, collections, sources, sections) "
                    + "projected from the audit log for the authenticated user.")
    @GetMapping("/me/activity")
    public ResponseEntity<ActivityFeedResponse> getMyActivity(
            @Parameter(description = "Max items to return (1-100, default 20)")
            @RequestParam(defaultValue = "20") int limit) {
        UUID userId = currentUserService.requireCurrentUser().getId();
        return ResponseEntity.ok(activityFeedService.getMyActivity(userId, limit));
    }
}
