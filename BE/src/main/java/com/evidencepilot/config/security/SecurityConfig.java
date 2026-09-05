package com.evidencepilot.config.security;

import com.evidencepilot.dto.response.ApiErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Spring Security configuration for the Evidence Pilot REST API.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ObjectMapper objectMapper;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // BE-01 fix: unauthenticated requests must yield 401 (not Spring's default 403).
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(
                                "/api/auth/login",
                                "/api/auth/password-reset/request",
                                "/api/auth/password-reset/confirm",
                                "/api/auth/set-password",
                                "/api/health",
                                "/api/health/**",
                                "/api/public/**",
                                "/error",
                                "/v3/api-docs",
                                "/v3/api-docs/**",
                                "/swagger-ui/**",
                                "/swagger-ui.html",
                                "/ws",
                                "/ws/**")
                        .permitAll()
                        .requestMatchers("/api/documents/*/download").permitAll()
                        .requestMatchers("/api/auth/update-password").authenticated()
                        .requestMatchers("/api/users/profile").authenticated()
                        // Self-service: any authenticated user can read their own activity,
                        // request/verify email OTP, and run the token-link email-change flow.
                        .requestMatchers("/api/users/me/**").authenticated()
                        .requestMatchers("/api/users/email/**").authenticated()
                        .requestMatchers("/api/users/email-change/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/users/avatar").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/users").hasAnyRole("ADMIN", "INSTRUCTOR")
                        .requestMatchers("/api/users/**").hasRole("ADMIN")
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex.authenticationEntryPoint((request, response, authException) -> {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType("application/json");
                    response.setCharacterEncoding("UTF-8");
                    objectMapper.writeValue(response.getWriter(), ApiErrorResponse.of(
                            HttpServletResponse.SC_UNAUTHORIZED,
                            "Unauthorized",
                            "Authentication required or token invalid",
                            request.getRequestURI()));
                }))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of(
                "http://localhost:5173",
                "http://localhost:5175",
                "http://localhost:3000",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:5175",
                "http://127.0.0.1:3000",
                "https://*.ngrok-free.app",
                "https://*.ngrok-free.dev",
                "https://*.ngrok.app",
                "https://*.ngrok.dev",
                "https://*.ngrok.io",
                "https://sep-490-prototype.vercel.app",
                "https://evidence-pilot.vercel.app"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Authorization", "Content-Disposition", "ngrok-skip-browser-warning"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(36000L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration authenticationConfiguration) throws Exception {
        return authenticationConfiguration.getAuthenticationManager();
    }
}
