package com.evidencepilot.service;

import com.evidencepilot.dto.request.UserProfileUpdateRequest;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.impl.UserServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class UserServiceImplTest {

    private final UserRepository users = mock(UserRepository.class);
    private final EmailOtpService emailOtp = mock(EmailOtpService.class);
    private final UserServiceImpl service = new UserServiceImpl(users, emailOtp);

    @Test
    void findUserById_mapsExistingUser() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setEmail("user@example.com");
        when(users.findById(id)).thenReturn(Optional.of(user));

        var response = service.findUserById(id);

        assertThat(response.getId()).isEqualTo(id);
        assertThat(response.getEmail()).isEqualTo("user@example.com");
    }

    @Test
    void findUserById_rejectsMissingUser() {
        UUID id = UUID.randomUUID();
        assertThatThrownBy(() -> service.findUserById(id)).hasMessageContaining(id.toString());
    }

    @Test
    void updateUserProfile_updatesOnlyProvidedFields() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setFirstName("Old");
        user.setLastName("Kept");
        UserProfileUpdateRequest request = new UserProfileUpdateRequest();
        request.setFirstName("New");
        when(users.findById(id)).thenReturn(Optional.of(user));
        when(users.save(user)).thenReturn(user);

        var response = service.updateUserProfile(id, request, null);

        assertThat(response.getFirstName()).isEqualTo("New");
        assertThat(response.getLastName()).isEqualTo("Kept");
        verifyNoInteractions(emailOtp);
    }

    @Test
    void updateUserProfile_emailChange_requiresValidClaim() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setEmail("old@example.com");
        user.setTokenVersion(3);
        UserProfileUpdateRequest request = new UserProfileUpdateRequest();
        request.setEmail("new@example.com");
        when(users.findById(id)).thenReturn(Optional.of(user));
        when(users.save(user)).thenReturn(user);
        when(emailOtp.consumeClaim(id, "new@example.com", "claim-token")).thenReturn(true);

        var response = service.updateUserProfile(id, request, "claim-token");

        assertThat(response.getEmail()).isEqualTo("new@example.com");
        assertThat(user.getTokenVersion()).isEqualTo(4);
    }

    @Test
    void updateUserProfile_emailChange_rejectsMissingClaim() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setEmail("old@example.com");
        UserProfileUpdateRequest request = new UserProfileUpdateRequest();
        request.setEmail("new@example.com");
        when(users.findById(id)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> service.updateUserProfile(id, request, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("verification claim");
    }

    @Test
    void updateUserProfile_emailChange_rejectsInvalidClaim() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setEmail("old@example.com");
        UserProfileUpdateRequest request = new UserProfileUpdateRequest();
        request.setEmail("new@example.com");
        when(users.findById(id)).thenReturn(Optional.of(user));
        when(emailOtp.consumeClaim(id, "new@example.com", "bad")).thenReturn(false);

        assertThatThrownBy(() -> service.updateUserProfile(id, request, "bad"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("verification claim");
    }

    @Test
    void updateUserProfile_emailUnchanged_skipsClaim() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setEmail("same@example.com");
        UserProfileUpdateRequest request = new UserProfileUpdateRequest();
        request.setEmail("same@example.com");
        when(users.findById(id)).thenReturn(Optional.of(user));
        when(users.save(user)).thenReturn(user);

        var response = service.updateUserProfile(id, request, null);

        assertThat(response.getEmail()).isEqualTo("same@example.com");
        verifyNoInteractions(emailOtp);
    }
}
