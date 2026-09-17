package com.evidencepilot.config.infrastructure;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.ReviewGuideRepository;
import com.evidencepilot.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DatabaseSeederTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private ReviewGuideRepository reviewGuideRepository;



    @Test
    void seedsThreeActiveAccountsFromConfiguration() {
        when(userRepository.findByEmail(anyString())).thenReturn(Optional.empty());
        when(passwordEncoder.encode(anyString())).thenAnswer(invocation -> "encoded:" + invocation.getArgument(0));
        when(reviewGuideRepository.findById(anyString())).thenReturn(Optional.empty());

        new DatabaseSeeder(
                userRepository,
                passwordEncoder,
                reviewGuideRepository,
                new ObjectMapper(),
                "configured-admin@example.com",
                "admin-password",
                "Configured",
                "Admin",
                "configured-student@example.com",
                "student-password",
                "Configured",
                "Student",
                " se123456 ",
                "configured-instructor@example.com",
                "instructor-password",
                "Configured",
                "Instructor")
                .run();

        ArgumentCaptor<User> users = ArgumentCaptor.forClass(User.class);
        verify(userRepository, org.mockito.Mockito.times(3)).save(users.capture());

        assertThat(users.getAllValues())
                .extracting(
                        User::getEmail,
                        User::getFirstName,
                        User::getLastName,
                        User::getStudentCode,
                        User::getRole,
                        User::getPasswordHash,
                        User::getAccountStatus)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(
                                "configured-admin@example.com", "Configured", "Admin", null, UserRole.ADMIN,
                                "encoded:admin-password", AccountStatus.ACTIVE),
                        org.assertj.core.groups.Tuple.tuple(
                                "configured-student@example.com", "Configured", "Student", "SE123456", UserRole.STUDENT,
                                "encoded:student-password", AccountStatus.ACTIVE),
                        org.assertj.core.groups.Tuple.tuple(
                                "configured-instructor@example.com", "Configured", "Instructor", null, UserRole.INSTRUCTOR,
                                "encoded:instructor-password", AccountStatus.ACTIVE));

        verify(reviewGuideRepository, org.mockito.Mockito.atLeastOnce()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void skipsSeedingWhenCredentialsAreMissing() {
        when(reviewGuideRepository.findById(anyString())).thenReturn(Optional.empty());

        new DatabaseSeeder(
                userRepository,
                passwordEncoder,
                reviewGuideRepository,
                new ObjectMapper(),
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "")
                .run();

        verifyNoInteractions(userRepository, passwordEncoder);
    }

    @Test
    void skipsStudentSeedWhenStudentCodeIsMissing() {
        when(reviewGuideRepository.findById(anyString())).thenReturn(Optional.empty());

        new DatabaseSeeder(
                userRepository,
                passwordEncoder,
                reviewGuideRepository,
                new ObjectMapper(),
                "",
                "",
                "",
                "",
                "student@example.com",
                "password",
                "Test",
                "Student",
                "",
                "",
                "",
                "",
                "")
                .run();

        verifyNoInteractions(userRepository, passwordEncoder);
    }

    @Test
    void configuredSeedUserIsActive() {
        User existing = new User();
        existing.setAccountStatus(AccountStatus.BANNED);
        when(userRepository.findByEmail("student@example.com")).thenReturn(Optional.of(existing));
        when(passwordEncoder.encode("password")).thenReturn("encoded");
        when(reviewGuideRepository.findById(anyString())).thenReturn(Optional.empty());

        new DatabaseSeeder(
                userRepository,
                passwordEncoder,
                reviewGuideRepository,
                new ObjectMapper(),
                "",
                "",
                "",
                "",
                "student@example.com",
                "password",
                "Test",
                "Student",
                "SE000001",
                "",
                "",
                "",
                "")
                .run();

        verify(userRepository).save(existing);
        assertThat(existing.getAccountStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(existing.getStudentCode()).isEqualTo("SE000001");
    }
}
