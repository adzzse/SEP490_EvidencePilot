package com.evidencepilot.config.security;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class JwtUtilsTest {

    private static final String SECRET = "EvidencePilot-Super-Secret-Key-For-Tests-2026";

    @Test
    void token_roundTripsUserClaims() {
        JwtUtils jwt = new JwtUtils(SECRET, 60_000);
        User user = user();

        String token = jwt.generateToken(user);

        assertThat(jwt.validateToken(token)).isTrue();
        assertThat(jwt.extractUserId(token)).isEqualTo(user.getId());
        assertThat(jwt.extractEmail(token)).isEqualTo(user.getEmail());
        assertThat(jwt.extractRole(token)).isEqualTo("INSTRUCTOR");
        assertThat(jwt.extractTokenVersion(token)).isEqualTo(7);
    }

    @Test
    void validateToken_rejectsMalformedExpiredAndWrongSignature() {
        assertThat(new JwtUtils(SECRET, 60_000).validateToken("not-a-token")).isFalse();
        assertThat(new JwtUtils(SECRET, -1).validateToken(new JwtUtils(SECRET, -1).generateToken(user()))).isFalse();

        String token = new JwtUtils(SECRET, 60_000).generateToken(user());
        assertThat(new JwtUtils("Different-Super-Secret-Key-For-Tests-2026", 60_000).validateToken(token)).isFalse();
    }

    private static User user() {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("instructor@test.com");
        user.setRole(UserRole.INSTRUCTOR);
        user.setTokenVersion(7);
        return user;
    }
}
