package com.evidencepilot.config.security;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class JwtAuthenticationFilterTest {

    private final JwtUtils jwtUtils = mock(JwtUtils.class);
    private final UserRepository users = mock(UserRepository.class);
    private final JwtSessionRegistry registry = new JwtSessionRegistry();
    private final JwtAuthenticationFilter filter = new JwtAuthenticationFilter(
            jwtUtils, users, registry, new ObjectMapper().registerModule(new JavaTimeModule()));
    private final FilterChain chain = mock(FilterChain.class);

    private void stubRegisteredJti(String token, String jti) {
        when(jwtUtils.extractJti(token)).thenReturn(jti);
        registry.register(jti);
    }

    @AfterEach
    void cleanSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void missingBearerToken_continuesWithoutAuthentication() throws Exception {
        var request = new MockHttpServletRequest();
        filter.doFilter(request, new MockHttpServletResponse(), chain);

        verify(chain).doFilter(any(), any());
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verifyNoInteractions(jwtUtils, users);
    }

    @Test
    void invalidToken_continuesWithoutAuthentication() throws Exception {
        var request = request("bad");
        when(jwtUtils.validateToken("bad")).thenReturn(false);

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verifyNoInteractions(users);
    }

    @Test
    void unknownUser_continuesWithoutAuthentication() throws Exception {
        UUID userId = UUID.randomUUID();
        var request = request("valid");
        when(jwtUtils.validateToken("valid")).thenReturn(true);
        when(jwtUtils.extractUserId("valid")).thenReturn(userId);
        stubRegisteredJti("valid", "jti-valid");

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void revokedJti_continuesWithoutAuthentication() throws Exception {
        var request = request("valid");
        when(jwtUtils.validateToken("valid")).thenReturn(true);
        when(jwtUtils.extractJti("valid")).thenReturn("jti-never-registered");

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verifyNoInteractions(users);
    }

    @Test
    void validToken_setsUserAndAuthorityFromDatabaseRole() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setRole(UserRole.INSTRUCTOR);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(3);
        var request = request("valid");
        when(jwtUtils.validateToken("valid")).thenReturn(true);
        when(jwtUtils.extractUserId("valid")).thenReturn(userId);
        when(jwtUtils.extractRole("valid")).thenReturn("ADMIN");
        when(jwtUtils.extractTokenVersion("valid")).thenReturn(3);
        when(users.findById(userId)).thenReturn(Optional.of(user));
        stubRegisteredJti("valid", "jti-valid");

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        var authentication = SecurityContextHolder.getContext().getAuthentication();
        assertThat(authentication.getPrincipal()).isSameAs(user);
        assertThat(authentication.getAuthorities()).extracting("authority").containsExactly("ROLE_INSTRUCTOR");
    }

    @Test
    void asyncDispatchWithValidToken_reestablishesAuthentication() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(1);
        var request = request("valid");
        request.setDispatcherType(DispatcherType.ASYNC);
        when(jwtUtils.validateToken("valid")).thenReturn(true);
        when(jwtUtils.extractUserId("valid")).thenReturn(userId);
        when(jwtUtils.extractTokenVersion("valid")).thenReturn(1);
        when(users.findById(userId)).thenReturn(Optional.of(user));
        stubRegisteredJti("valid", "jti-valid");

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        var authentication = SecurityContextHolder.getContext().getAuthentication();
        assertThat(authentication).isNotNull();
        assertThat(authentication.getPrincipal()).isSameAs(user);
    }

    @Test
    void staleToken_returnsUnauthorizedWithoutAuthentication() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(4);
        when(jwtUtils.validateToken("valid")).thenReturn(true);
        when(jwtUtils.extractUserId("valid")).thenReturn(userId);
        when(jwtUtils.extractTokenVersion("valid")).thenReturn(3);
        when(users.findById(userId)).thenReturn(Optional.of(user));
        stubRegisteredJti("valid", "jti-valid");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request("valid"), response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verifyNoInteractions(chain);
    }

    @Test
    void tokenWithoutVersion_returnsUnauthorized() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        when(jwtUtils.validateToken("legacy")).thenReturn(true);
        when(jwtUtils.extractUserId("legacy")).thenReturn(userId);
        when(jwtUtils.extractTokenVersion("legacy")).thenReturn(null);
        when(users.findById(userId)).thenReturn(Optional.of(user));
        stubRegisteredJti("legacy", "jti-legacy");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request("legacy"), response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        verifyNoInteractions(chain);
    }

    @Test
    void inactiveUser_returnsForbiddenEvenWithCurrentTokenVersion() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.BANNED);
        user.setTokenVersion(2);
        when(jwtUtils.validateToken("valid")).thenReturn(true);
        when(jwtUtils.extractUserId("valid")).thenReturn(userId);
        when(jwtUtils.extractTokenVersion("valid")).thenReturn(2);
        when(users.findById(userId)).thenReturn(Optional.of(user));
        stubRegisteredJti("valid", "jti-valid");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request("valid"), response, chain);

        assertThat(response.getStatus()).isEqualTo(403);
        verifyNoInteractions(chain);
    }

    private static MockHttpServletRequest request(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }
}
