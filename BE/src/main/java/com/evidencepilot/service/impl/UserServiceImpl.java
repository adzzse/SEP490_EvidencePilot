package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.UserProfileUpdateRequest;
import com.evidencepilot.dto.response.UserResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;

    @Override
    public UserResponse findUserById(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(id, "User"));
        return UserResponse.from(user);
    }

    @Override
    public UserResponse updateUserProfile(UUID userId, UserProfileUpdateRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException(userId, "User"));
        if (request.getFirstName() != null) {
            user.setFirstName(request.getFirstName());
        }
        if (request.getLastName() != null) {
            user.setLastName(request.getLastName());
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
