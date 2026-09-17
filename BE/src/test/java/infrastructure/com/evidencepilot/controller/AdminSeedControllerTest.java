package com.evidencepilot.controller;

import com.evidencepilot.config.security.JwtAuthenticationFilter;
import com.evidencepilot.config.security.JwtSessionRegistry;
import com.evidencepilot.config.security.JwtUtils;
import com.evidencepilot.config.security.SecurityConfig;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AdminExcelSeedService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

class AdminSeedControllerTest {
    private AnnotationConfigWebApplicationContext context;
    private AdminExcelSeedService service;
    private MockMvc mvc;
    @TempDir Path temp;

    @Configuration
    @EnableWebMvc
    static class Config {
        @Bean ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }
        @Bean JwtUtils jwtUtils() { return mock(JwtUtils.class); }
        @Bean JwtSessionRegistry sessions() { return mock(JwtSessionRegistry.class); }
        @Bean UserRepository users() { return mock(UserRepository.class); }
        @Bean JwtAuthenticationFilter jwtFilter(JwtUtils jwt, UserRepository users, JwtSessionRegistry sessions, ObjectMapper mapper) {
            return new JwtAuthenticationFilter(jwt, users, sessions, mapper);
        }
        @Bean AdminExcelSeedService seedService() { return mock(AdminExcelSeedService.class); }
        @Bean AdminSeedController controller(AdminExcelSeedService service) { return new AdminSeedController(service); }
        @Bean GlobalExceptionHandler errors() { return new GlobalExceptionHandler(); }
    }

    @BeforeEach
    void setup() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(Config.class, SecurityConfig.class);
        context.refresh();
        service = context.getBean(AdminExcelSeedService.class);
        mvc = webAppContextSetup(context).addFilters(context.getBean(FilterChainProxy.class)).build();
        authenticate(UserRole.ADMIN);
    }

    @AfterEach
    void close() { context.close(); }

    private void authenticate(UserRole role) {
        var user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setTokenVersion(0);
        JwtUtils jwt = context.getBean(JwtUtils.class);
        when(jwt.validateToken(anyString())).thenReturn(true);
        when(jwt.extractUserId(anyString())).thenReturn(user.getId());
        when(jwt.extractTokenVersion(anyString())).thenReturn(0);
        when(context.getBean(JwtSessionRegistry.class).isValid(any())).thenReturn(true);
        when(context.getBean(UserRepository.class).findById(user.getId())).thenReturn(Optional.of(user));
    }

    @ParameterizedTest
    @EnumSource(value = UserRole.class, names = {"STUDENT", "INSTRUCTOR"})
    void nonAdminCannotPreviewUploadOrPoll(UserRole role) throws Exception {
        authenticate(role);
        for (String path : List.of("preview", "upload", "upload-zip")) {
            mvc.perform(multipart("/api/admin/seed/" + path).file(file()).header("Authorization", "Bearer fixture"))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/admin/seed/jobs/" + UUID.randomUUID()).header("Authorization", "Bearer fixture"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void anonymousCannotUpload() throws Exception {
        mvc.perform(multipart("/api/admin/seed/upload").file(file())).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void busyImportRejectsBeforeReadingOrDecompressing() throws Exception {
        when(service.tryReserveImport()).thenReturn(false);
        for (String path : List.of("upload", "upload-zip")) {
            mvc.perform(multipart("/api/admin/seed/" + path).file(file()).header("Authorization", "Bearer fixture"))
                    .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "5"));
        }
        verify(service, never()).readZip(any());
        verify(service, never()).readXlsx(any(), anyLong());
        verify(service, never()).releaseImport();
    }

    @Test
    void uploadLimitReleasesReservation() throws Exception {
        when(service.tryReserveImport()).thenReturn(true);
        doThrow(new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Seed upload limit exceeded"))
                .when(service).checkUploadSize(anyLong());
        mvc.perform(multipart("/api/admin/seed/upload-zip").file(file()).header("Authorization", "Bearer fixture"))
                .andExpect(status().isPayloadTooLarge());
        verify(service).releaseImport();
        verify(service, never()).readZip(any());
    }

    @Test
    void invalidWorkbookReleasesReservation() throws Exception {
        when(service.tryReserveImport()).thenReturn(true);
        when(service.readXlsx(any(), anyLong())).thenReturn(new byte[0]);
        when(service.submit(any(), any(), isNull())).thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid XLSX workbook"));
        mvc.perform(multipart("/api/admin/seed/upload").file(file()).header("Authorization", "Bearer fixture"))
                .andExpect(status().isBadRequest());
        verify(service).releaseImport();
    }

    @Test
    void multipleRootWorkbooksCleanSpoolAndRelease() throws Exception {
        Path spool = Files.createDirectory(temp.resolve("multiple"));
        Path first = Files.write(spool.resolve("seed.xlsx"), new byte[0]);
        Path second = Files.write(spool.resolve("other.xlsx"), new byte[0]);
        when(service.tryReserveImport()).thenReturn(true);
        when(service.readZip(any())).thenReturn(new AdminExcelSeedService.ZipBundle(
                Map.of("seed.xlsx", first, "other.xlsx", second), List.of(), spool));
        mvc.perform(multipart("/api/admin/seed/upload-zip").file(file()).header("Authorization", "Bearer fixture"))
                .andExpect(status().isBadRequest());
        assertThat(spool).doesNotExist();
        verify(service).releaseImport();
        verify(service, never()).readXlsx(any(), anyLong());
    }

    @Test
    void fallbackWorkbookIsRemovedAndRejectedSubmissionCleansSpool() throws Exception {
        Path spool = Files.createDirectory(temp.resolve("fallback"));
        Path workbook = Files.write(spool.resolve("custom.xlsx"), new byte[0]);
        when(service.tryReserveImport()).thenReturn(true);
        when(service.readZip(any())).thenReturn(new AdminExcelSeedService.ZipBundle(Map.of("custom.xlsx", workbook), List.of(), spool));
        when(service.readXlsx(any(), eq(0L))).thenReturn(new byte[0]);
        when(service.submit(any(), any(), isNull())).thenAnswer(call -> {
            AdminExcelSeedService.ZipBundle bundle = call.getArgument(1);
            assertThat(bundle.files()).isEmpty();
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Worker rejected");
        });
        mvc.perform(multipart("/api/admin/seed/upload-zip").file(file()).header("Authorization", "Bearer fixture"))
                .andExpect(status().isTooManyRequests());
        assertThat(spool).doesNotExist();
        verify(service).releaseImport();
    }

    @Test
    void acceptedSubmissionTransfersCleanupToWorker() throws Exception {
        Path spool = Files.createDirectory(temp.resolve("accepted"));
        Path workbook = Files.write(spool.resolve("seed.xlsx"), new byte[0]);
        when(service.tryReserveImport()).thenReturn(true);
        when(service.readZip(any())).thenReturn(new AdminExcelSeedService.ZipBundle(Map.of("seed.xlsx", workbook), List.of(), spool));
        when(service.readXlsx(any(), anyLong())).thenReturn(new byte[0]);
        when(service.submit(any(), any(), isNull())).thenReturn(new AdminExcelSeedService.SeedJob());
        mvc.perform(multipart("/api/admin/seed/upload-zip").file(file()).header("Authorization", "Bearer fixture"))
                .andExpect(status().isAccepted());
        assertThat(spool).exists();
        verify(service, never()).releaseImport();
    }

    @Test
    void unknownJobReturns404() throws Exception {
        mvc.perform(get("/api/admin/seed/jobs/" + UUID.randomUUID()).header("Authorization", "Bearer fixture"))
                .andExpect(status().isNotFound());
    }

    private static MockMultipartFile file() {
        return new MockMultipartFile("file", "fixture.zip", "application/zip", new byte[]{1});
    }
}
