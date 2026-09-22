package com.evidencepilot.repository;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class UserRepositorySearchTest {

    @Autowired UserRepository users;

    @Test
    void searchByRoleMatchesNameEmailAndStudentCode() {
        User match = users.save(user("An", "Nguyen", "an.nguyen@test.com", "SE170001"));

        assertThat(users.searchByRole(UserRole.STUDENT, "nguyen")).contains(match);
        assertThat(users.searchByRole(UserRole.STUDENT, "an.nguyen@test")).contains(match);
        assertThat(users.searchByRole(UserRole.STUDENT, "se170001")).contains(match);
        assertThat(users.searchByRole(UserRole.STUDENT, "SE170001")).contains(match);
        assertThat(users.searchByRole(UserRole.STUDENT, "no-such-user")).isEmpty();
    }

    private static User user(String firstName, String lastName, String email, String studentCode) {
        User user = new User();
        user.setEmail(email);
        user.setPasswordHash("hash");
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setStudentCode(studentCode);
        user.setCreatedAt(LocalDateTime.now());
        return user;
    }
}
