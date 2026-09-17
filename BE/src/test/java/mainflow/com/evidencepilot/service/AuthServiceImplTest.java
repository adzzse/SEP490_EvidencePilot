package com.evidencepilot.service;

import com.evidencepilot.config.security.JwtSessionRegistry;
import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.dto.request.LoginRequest;
import com.evidencepilot.dto.request.UpdatePasswordRequest;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.impl.AuthServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthServiceImplTest {

    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);
    private final JwtUtils jwtUtils = mock(JwtUtils.class);
    private final JwtSessionRegistry registry = new JwtSessionRegistry();
    private AuthServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new AuthServiceImpl(users, encoder, jwtUtils, registry);
    }

    @Test
    void loginConsumesPasswordNoticeOnlyOnce() {
        User user = activeUser();
        LoginRequest request = loginRequest();
        when(users.findByEmail(request.getEmail())).thenReturn(Optional.of(user));
        when(encoder.matches(request.getPassword(), user.getPasswordHash())).thenReturn(true);
        when(users.consumePasswordChangeNotice(user.getId())).thenReturn(1, 0);
        when(jwtUtils.generateToken(user)).thenReturn("jwt");

        assertThat(service.login(request).isPasswordChangeNotice()).isTrue();
        assertThat(service.login(request).isPasswordChangeNotice()).isFalse();
        verify(users, org.mockito.Mockito.times(2)).consumePasswordChangeNotice(user.getId());
    }

    @Test
    void loginRejectsUnknownOrWrongCredentialsWithoutConsumingNotice() {
        LoginRequest request = loginRequest();
        assertThatThrownBy(() -> service.login(request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401");

        User user = activeUser();
        when(users.findByEmail(request.getEmail())).thenReturn(Optional.of(user));
        when(encoder.matches(anyString(), anyString())).thenReturn(false);
        assertThatThrownBy(() -> service.login(request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401");
        verify(users, never()).consumePasswordChangeNotice(user.getId());
    }

    @Test
    void refreshRevokesOldJtiAndNeverReturnsPasswordNotice() {
        User user = activeUser();
        when(jwtUtils.validateToken("old")).thenReturn(true);
        when(jwtUtils.extractJti("old")).thenReturn("jti-old");
        when(jwtUtils.extractJti("new")).thenReturn("jti-new");
        when(jwtUtils.extractUserId("old")).thenReturn(user.getId());
        when(jwtUtils.generateToken(user)).thenReturn("new");
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        registry.register("jti-old");

        var response = service.refresh("old");

        assertThat(response.getToken()).isEqualTo("new");
        assertThat(response.isPasswordChangeNotice()).isFalse();
        assertThat(registry.isValid("jti-old")).isFalse();
        assertThat(registry.isValid("jti-new")).isTrue();
    }

    @Test
    void refreshRejectsInvalidOrRevokedToken() {
        when(jwtUtils.validateToken("bad")).thenReturn(false);
        assertThatThrownBy(() -> service.refresh("bad"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401");

        when(jwtUtils.validateToken("old")).thenReturn(true);
        when(jwtUtils.extractJti("old")).thenReturn("jti-old");
        assertThatThrownBy(() -> service.refresh("old"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401");
    }

    @Test
    void updatePasswordChecksCurrentPasswordAndInvalidatesExistingTokens() {
        User user = activeUser();
        user.setPasswordChangeNoticePending(true);
        user.setTokenVersion(4);
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(encoder.matches("current", "hash")).thenReturn(true);
        when(encoder.encode("NewPass123!")).thenReturn("new-hash");

        service.updatePassword(user.getId(), new UpdatePasswordRequest("current", "NewPass123!"));

        assertThat(user.getPasswordHash()).isEqualTo("new-hash");
        assertThat(user.getTokenVersion()).isEqualTo(5);
        assertThat(user.isPasswordChangeNoticePending()).isFalse();
        verify(users).save(user);
    }

    @Test
    void updatePasswordRejectsWrongCurrentPassword() {
        User user = activeUser();
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(encoder.matches("wrong", "hash")).thenReturn(false);

        assertThatThrownBy(() -> service.updatePassword(
                user.getId(), new UpdatePasswordRequest("wrong", "NewPass123!")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
        verify(users, never()).save(user);
    }

    private static LoginRequest loginRequest() {
        LoginRequest request = new LoginRequest();
        request.setEmail("user@test.com");
        request.setPassword("StrongPass1!");
        return request;
    }

    private static User activeUser() {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("user@test.com");
        user.setPasswordHash("hash");
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        return user;
    }
}
