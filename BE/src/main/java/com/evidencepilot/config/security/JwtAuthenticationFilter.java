package com.evidencepilot.config.security;

import com.evidencepilot.dto.response.ApiErrorResponse;
import com.evidencepilot.exception.ApiException;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String RESET_REQUEST_PATH = "/api/auth/password-reset/request";
    private static final String RESET_CONFIRM_PATH = "/api/auth/password-reset/confirm";

    private final JwtUtils jwtUtils;
    private final UserRepository userRepository;
    private final JwtSessionRegistry sessionRegistry;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return RESET_REQUEST_PATH.equals(path) || RESET_CONFIRM_PATH.equals(path);
    }

    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);
        if (!jwtUtils.validateToken(token) || !sessionRegistry.isValid(jwtUtils.extractJti(token))) {
            filterChain.doFilter(request, response);
            return;
        }

        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            UUID userId = jwtUtils.extractUserId(token);
            User user = userRepository.findById(userId).orElse(null);
            if (user == null) {
                filterChain.doFilter(request, response);
                return;
            }

            if (user.getAccountStatus() != AccountStatus.ACTIVE) {
                writeError(request, response, HttpServletResponse.SC_FORBIDDEN,
                        ApiException.ACCOUNT_BANNED, "Account is not active");
                return;
            }

            Integer currentVersion = user.getTokenVersion();
            Integer tokenVersion = jwtUtils.extractTokenVersion(token);
            if (tokenVersion == null || !tokenVersion.equals(currentVersion)) {
                writeError(request, response, HttpServletResponse.SC_UNAUTHORIZED, null, "Token is stale");
                return;
            }

            String authority = "ROLE_" + user.getRole().name();

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            user, null,
                            List.of(new SimpleGrantedAuthority(authority)));

            authentication.setDetails(
                    new WebAuthenticationDetailsSource().buildDetails(request));

            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        filterChain.doFilter(request, response);
    }

    private void writeError(HttpServletRequest request, HttpServletResponse response,
                            int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), ApiErrorResponse.of(
                status,
                status == HttpServletResponse.SC_UNAUTHORIZED ? "Unauthorized" : "Forbidden",
                message,
                code,
                request.getRequestURI()));
    }
}
