package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.UserProfileUpdateRequest;
import com.evidencepilot.dto.response.UserResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.EmailOtpService;
import com.evidencepilot.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final EmailOtpService emailOtpService;

    @Override
    public UserResponse findUserById(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(id, "User"));
        return UserResponse.from(user);
    }

    @Override
    public UserResponse updateUserProfile(UUID userId, UserProfileUpdateRequest request, String emailClaimToken) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException(userId, "User"));
        if (request.getFirstName() != null) {
            user.setFirstName(request.getFirstName());
        }
        if (request.getLastName() != null) {
            user.setLastName(request.getLastName());
        }
        if (request.getEmail() != null && !request.getEmail().isBlank()) {
            String normalized = request.getEmail().trim().toLowerCase(Locale.ROOT);
            if (!normalized.equalsIgnoreCase(user.getEmail())) {
                if (userRepository.existsByEmailIgnoreCase(normalized)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Email address is already in use by another account");
                }
                if (emailClaimToken == null || emailClaimToken.isBlank()
                        || !emailOtpService.consumeClaim(userId, normalized, emailClaimToken)) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                            "Email change requires a valid verification claim. Verify your new email first.");
                }
                user.setEmail(normalized);
                user.setTokenVersion(user.getTokenVersion() + 1);
            }
        }
        return UserResponse.from(userRepository.save(user));
    }

    @Override
    public List<UserResponse> findUsersByRole(UserRole role) {
        return userRepository.findByRole(role).stream()
                .map(UserResponse::from)
                .toList();
    }

    @Override
    public List<UserResponse> searchUsersByRole(UserRole role, String q) {
        return userRepository.searchByRole(role, q).stream()
                .map(UserResponse::from)
                .toList();
    }
}
