package com.evidencepilot.controller;

import com.evidencepilot.config.security.JwtSessionRegistry;
import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.config.security.SecurityConfig;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AiGenerationConfigService;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.CurrentUserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

class AdminAiConfigControllerTest {
    private static final AiModelClient.GenerationCatalog CATALOG = new AiModelClient.GenerationCatalog(
            1, "remote", List.of("model-a", "model-b"), List.of("model-a"),
            "a".repeat(64), 8000, 48000);
    private static final AiModelClient.GenerationSelection SELECTION = new AiModelClient.GenerationSelection(
            3, "remote", List.of("model-b"), "a".repeat(64), "b".repeat(64));

    AnnotationConfigWebApplicationContext context;
    MockMvc mvc;
    AiGenerationConfigService configService;
    AiModelClient aiModelClient;

    @Configuration static class Config {
        @Bean AiGenerationConfigService configService() { return mock(AiGenerationConfigService.class); }
        @Bean AiModelClient aiModelClient() { return mock(AiModelClient.class); }
        @Bean CurrentUserService currentUserService() { return mock(CurrentUserService.class); }
        @Bean AdminAiConfigController controller(AiGenerationConfigService configService,
                AiModelClient aiModelClient, CurrentUserService currentUserService) {
            return new AdminAiConfigController(configService, aiModelClient, currentUserService);
        }
    }

    @BeforeEach void setup() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(AdminSeedControllerTest.Config.class, SecurityConfig.class, Config.class);
        context.refresh();
        configService = context.getBean(AiGenerationConfigService.class);
        aiModelClient = context.getBean(AiModelClient.class);
        mvc = webAppContextSetup(context).addFilters(context.getBean(FilterChainProxy.class)).build();
    }

    @AfterEach void close() { context.close(); }

    @ParameterizedTest @EnumSource(value = UserRole.class, names = {"STUDENT", "INSTRUCTOR"})
    void nonAdminCannotReadOrUpdate(UserRole role) throws Exception {
        authenticate(role);
        mvc.perform(get("/api/admin/ai/configuration").header("Authorization", "Bearer fixture"))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/ai/configuration").header("Authorization", "Bearer fixture")
                .contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(configService, aiModelClient);
    }

    @Test void anonymousCannotReadConfiguration() throws Exception {
        mvc.perform(get("/api/admin/ai/configuration")).andExpect(status().isUnauthorized());
        verifyNoInteractions(configService, aiModelClient);
    }

    @Test void savedSelectionRemainsReadableWhenModelServiceIsUnavailable() throws Exception {
        authenticate(UserRole.ADMIN);
        when(configService.configuration()).thenReturn(Optional.of(
                new AiGenerationConfigService.StoredSelection(AiGenerationConfigService.ADMIN, SELECTION)));
        when(aiModelClient.generationCatalog()).thenThrow(
                new AiModelClient.AiApiException("/ai/generation-config", 503, "unavailable", null));

        mvc.perform(get("/api/admin/ai/configuration").header("Authorization", "Bearer fixture"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serviceStatus").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.persisted").value(true))
                .andExpect(jsonPath("$.modelIds[0]").value("model-b"))
                .andExpect(jsonPath("$.catalog").doesNotExist());
    }

    @Test void firstReadShowsServiceDefaultsWithoutPersistingThem() throws Exception {
        authenticate(UserRole.ADMIN);
        when(configService.configuration()).thenReturn(Optional.empty());
        when(aiModelClient.generationCatalog()).thenReturn(CATALOG);
        when(configService.candidate(CATALOG, CATALOG.defaultModels())).thenReturn(
                new AiModelClient.GenerationSelection(0, "remote", List.of("model-a"),
                        "a".repeat(64), "c".repeat(64)));

        mvc.perform(get("/api/admin/ai/configuration").header("Authorization", "Bearer fixture"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.persisted").value(false))
                .andExpect(jsonPath("$.source").value("SERVICE_DEFAULT"))
                .andExpect(jsonPath("$.modelIds[0]").value("model-a"));
    }

    private void authenticate(UserRole role) {
        var user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        user.setAccountStatus(AccountStatus.ACTIVE);
        var jwt = context.getBean(JwtUtils.class);
        when(jwt.validateToken(anyString())).thenReturn(true);
        when(jwt.extractUserId(anyString())).thenReturn(user.getId());
        when(jwt.extractTokenVersion(anyString())).thenReturn(0);
        when(context.getBean(JwtSessionRegistry.class).isValid(any())).thenReturn(true);
        when(context.getBean(UserRepository.class).findById(user.getId())).thenReturn(Optional.of(user));
    }
}
