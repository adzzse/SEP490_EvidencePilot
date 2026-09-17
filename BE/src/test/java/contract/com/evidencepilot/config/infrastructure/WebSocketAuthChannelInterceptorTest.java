package com.evidencepilot.config.infrastructure;

import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;

import java.util.Optional;
import java.util.UUID;
import java.security.Principal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class WebSocketAuthChannelInterceptorTest {

    private final JwtUtils jwtUtils = mock(JwtUtils.class);
    private final UserRepository users = mock(UserRepository.class);
    private final WebSocketAuthChannelInterceptor interceptor =
            new WebSocketAuthChannelInterceptor(jwtUtils, users);
    private final MessageChannel channel = mock(MessageChannel.class);

    @Test
    void nonConnectMessageWithoutPrincipal_passesThrough() {
        Message<byte[]> message = message(StompCommand.SEND, null);
        assertThat(interceptor.preSend(message, channel)).isSameAs(message);
        verifyNoInteractions(jwtUtils, users);
    }

    @Test
    void authenticatedMessage_rejectsAccountInvalidatedAfterConnect() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(2);
        when(jwtUtils.validateToken("token")).thenReturn(true);
        when(jwtUtils.extractUserId("token")).thenReturn(id);
        when(jwtUtils.extractTokenVersion("token")).thenReturn(2);
        when(users.findById(id)).thenReturn(Optional.of(user));

        Principal connected = StompHeaderAccessor.wrap(
                interceptor.preSend(message(StompCommand.CONNECT, "token"), channel)).getUser();

        user.setAccountStatus(AccountStatus.BANNED);
        assertThatThrownBy(() -> interceptor.preSend(message(StompCommand.SEND, null, connected), channel))
                .isInstanceOf(AccessDeniedException.class);

        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(3);
        assertThatThrownBy(() -> interceptor.preSend(message(StompCommand.SUBSCRIBE, null, connected), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void authenticatedMessageWithCurrentAccount_passesThrough() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setRole(UserRole.INSTRUCTOR);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(2);
        when(jwtUtils.validateToken("token")).thenReturn(true);
        when(jwtUtils.extractUserId("token")).thenReturn(id);
        when(jwtUtils.extractTokenVersion("token")).thenReturn(2);
        when(users.findById(id)).thenReturn(Optional.of(user));
        Principal connected = StompHeaderAccessor.wrap(
                interceptor.preSend(message(StompCommand.CONNECT, "token"), channel)).getUser();
        Message<byte[]> send = message(StompCommand.SEND, null, connected);

        assertThat(interceptor.preSend(send, channel)).isSameAs(send);
    }

    @Test
    void outboundMessageWithoutPrincipal_revalidatesConnectedSession() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(2);
        when(jwtUtils.validateToken("token")).thenReturn(true);
        when(jwtUtils.extractUserId("token")).thenReturn(id);
        when(jwtUtils.extractTokenVersion("token")).thenReturn(2);
        when(users.findById(id)).thenReturn(Optional.of(user));
        interceptor.preSend(message(StompCommand.CONNECT, "token", null, "session-1"), channel);

        user.setAccountStatus(AccountStatus.BANNED);
        Message<byte[]> outbound = message(StompCommand.MESSAGE, null, null, "session-1");

        assertThatThrownBy(() -> interceptor.preSend(outbound, channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void disconnectRemovesSessionWithoutRevalidatingInvalidatedAccount() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(2);
        when(jwtUtils.validateToken("token")).thenReturn(true);
        when(jwtUtils.extractUserId("token")).thenReturn(id);
        when(jwtUtils.extractTokenVersion("token")).thenReturn(2);
        when(users.findById(id)).thenReturn(Optional.of(user));
        interceptor.preSend(message(StompCommand.CONNECT, "token", null, "session-1"), channel);
        user.setAccountStatus(AccountStatus.BANNED);
        Message<byte[]> disconnect = message(StompCommand.DISCONNECT, null, null, "session-1");

        assertThat(interceptor.preSend(disconnect, channel)).isSameAs(disconnect);

        Message<byte[]> afterDisconnect = message(StompCommand.MESSAGE, null, null, "session-1");
        assertThat(interceptor.preSend(afterDisconnect, channel)).isSameAs(afterDisconnect);
        verify(users).findById(id);
    }

    @Test
    void connect_rejectsMissingOrInvalidToken() {
        assertThatThrownBy(() -> interceptor.preSend(message(StompCommand.CONNECT, null), channel))
                .isInstanceOf(AccessDeniedException.class);

        when(jwtUtils.validateToken("bad")).thenReturn(false);
        assertThatThrownBy(() -> interceptor.preSend(message(StompCommand.CONNECT, "bad"), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void connect_rejectsUnknownUser() {
        UUID id = UUID.randomUUID();
        when(jwtUtils.validateToken("token")).thenReturn(true);
        when(jwtUtils.extractUserId("token")).thenReturn(id);

        assertThatThrownBy(() -> interceptor.preSend(message(StompCommand.CONNECT, "token"), channel))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("not found");
    }

    @Test
    void connect_setsAuthenticatedPrincipalAndRole() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setRole(UserRole.INSTRUCTOR);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(2);
        when(jwtUtils.validateToken("token")).thenReturn(true);
        when(jwtUtils.extractUserId("token")).thenReturn(id);
        when(jwtUtils.extractRole("token")).thenReturn("ADMIN");
        when(jwtUtils.extractTokenVersion("token")).thenReturn(2);
        when(users.findById(id)).thenReturn(Optional.of(user));
        Message<byte[]> message = message(StompCommand.CONNECT, "token");

        Message<?> result = interceptor.preSend(message, channel);

        var principal = StompHeaderAccessor.wrap(result).getUser();
        assertThat(principal).isInstanceOf(UsernamePasswordAuthenticationToken.class);
        assertThat(principal.getName()).isEqualTo(id.toString());
        assertThat(((UsernamePasswordAuthenticationToken) principal).getAuthorities())
                .extracting("authority").containsExactly("ROLE_INSTRUCTOR");
        assertThat(((UsernamePasswordAuthenticationToken) principal).getDetails()).isEqualTo(2);
    }

    @Test
    void connect_rejectsInactiveOrStaleUser() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(5);
        when(jwtUtils.validateToken("token")).thenReturn(true);
        when(jwtUtils.extractUserId("token")).thenReturn(id);
        when(jwtUtils.extractTokenVersion("token")).thenReturn(4);
        when(users.findById(id)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> interceptor.preSend(message(StompCommand.CONNECT, "token"), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void connect_rejectsTokenWithoutVersion() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        when(jwtUtils.validateToken("legacy")).thenReturn(true);
        when(jwtUtils.extractUserId("legacy")).thenReturn(id);
        when(jwtUtils.extractTokenVersion("legacy")).thenReturn(null);
        when(users.findById(id)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> interceptor.preSend(message(StompCommand.CONNECT, "legacy"), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void connect_rejectsInactiveUserWithCurrentTokenVersion() {
        UUID id = UUID.randomUUID();
        User user = new User();
        user.setId(id);
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.BANNED);
        user.setTokenVersion(2);
        when(jwtUtils.validateToken("token")).thenReturn(true);
        when(jwtUtils.extractUserId("token")).thenReturn(id);
        when(jwtUtils.extractTokenVersion("token")).thenReturn(2);
        when(users.findById(id)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> interceptor.preSend(message(StompCommand.CONNECT, "token"), channel))
                .isInstanceOf(AccessDeniedException.class);
    }

    private static Message<byte[]> message(StompCommand command, String token) {
        return message(command, token, null);
    }

    private static Message<byte[]> message(StompCommand command, String token, Principal user) {
        return message(command, token, user, null);
    }

    private static Message<byte[]> message(
            StompCommand command, String token, Principal user, String sessionId) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        if (token != null) {
            accessor.setNativeHeader("Authorization", "Bearer " + token);
        }
        accessor.setUser(user);
        accessor.setSessionId(sessionId);
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }
}
