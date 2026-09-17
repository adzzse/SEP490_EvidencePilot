package com.evidencepilot.service.impl;

import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.dto.request.LoginRequest;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class AuthServiceImplAccountStatusTest {

    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final JwtUtils jwt = mock(JwtUtils.class);
    private final AuthServiceImpl service = new AuthServiceImpl(
            users, passwords, jwt, new com.evidencepilot.config.security.JwtSessionRegistry());

    @ParameterizedTest
    @EnumSource(value = AccountStatus.class, names = {"PENDING", "BANNED", "DELETED"})
    void loginRejectsNonActiveAccountAfterCorrectCredentials(AccountStatus status) {
        User user = user(status);
        when(users.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwords.matches("StrongPass1!", user.getPasswordHash())).thenReturn(true);
        LoginRequest request = new LoginRequest();
        request.setEmail(user.getEmail());
        request.setPassword("StrongPass1!");

        assertThatThrownBy(() -> service.login(request))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(403));
        verifyNoInteractions(jwt);
    }

    private static User user(AccountStatus status) {
        User user = new User();
        user.setEmail("student@test.com");
        user.setPasswordHash("hash");
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(status);
        return user;
    }
}
