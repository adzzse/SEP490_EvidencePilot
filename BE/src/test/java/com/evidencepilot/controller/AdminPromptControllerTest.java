package com.evidencepilot.controller;

import com.evidencepilot.config.security.JwtSessionRegistry;
import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.config.security.SecurityConfig;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.PromptTemplateService;
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
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

class AdminPromptControllerTest {
    AnnotationConfigWebApplicationContext context;
    MockMvc mvc;
    PromptTemplateService service;

    @Configuration static class Config {
        @Bean PromptTemplateService prompts() { return mock(PromptTemplateService.class); }
        @Bean AdminPromptController controller(PromptTemplateService service) { return new AdminPromptController(service); }
    }

    @BeforeEach void setup() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(AdminSeedControllerTest.Config.class, SecurityConfig.class, Config.class);
        context.refresh();
        service = context.getBean(PromptTemplateService.class);
        mvc = webAppContextSetup(context).addFilters(context.getBean(FilterChainProxy.class)).build();
    }

    @AfterEach void close() { context.close(); }

    void authenticate(UserRole role) {
        var user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(0);
        var jwt = context.getBean(JwtUtils.class);
        when(jwt.validateToken(anyString())).thenReturn(true);
        when(jwt.extractUserId(anyString())).thenReturn(user.getId());
        when(jwt.extractTokenVersion(anyString())).thenReturn(0);
        when(context.getBean(JwtSessionRegistry.class).isValid(any())).thenReturn(true);
        when(context.getBean(UserRepository.class).findById(user.getId())).thenReturn(Optional.of(user));
    }

    @ParameterizedTest @EnumSource(value = UserRole.class, names = {"STUDENT", "INSTRUCTOR"})
    void nonAdminCannotReadCreateValidateOrActivate(UserRole role) throws Exception {
        authenticate(role);
        for (String path : List.of("", "/defaults"))
            mvc.perform(get("/api/admin/prompts" + path).header("Authorization", "Bearer fixture")).andExpect(status().isForbidden());
        for (String path : List.of("", "/" + UUID.randomUUID() + "/validate", "/" + UUID.randomUUID() + "/activate"))
            mvc.perform(post("/api/admin/prompts" + path).header("Authorization", "Bearer fixture")
                    .contentType("application/json").content("{}"))
                    .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test void validationStatesConfigurationOnlyAndNoRuntimeVerification() throws Exception {
        authenticate(UserRole.ADMIN);
        UUID id = UUID.randomUUID();
        when(service.validateConfiguration(id)).thenReturn(List.of());
        mvc.perform(post("/api/admin/prompts/" + id + "/validate").header("Authorization", "Bearer fixture"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.validation_type").value("CONFIGURATION"))
                .andExpect(jsonPath("$.runtime_verified").value(false));
        verify(service, never()).activate(any());
    }

    @Test void anonymousCannotValidate() throws Exception {
        mvc.perform(post("/api/admin/prompts/" + UUID.randomUUID() + "/validate")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
}
