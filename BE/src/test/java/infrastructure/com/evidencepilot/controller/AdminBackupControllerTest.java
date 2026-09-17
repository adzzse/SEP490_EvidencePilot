package com.evidencepilot.controller;

import com.evidencepilot.config.security.SecurityConfig;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.service.AdminSeedExportService;
import com.evidencepilot.service.DocumentObjectStorage;
import com.evidencepilot.repository.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.SliceImpl;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

class AdminBackupControllerTest {
    AnnotationConfigWebApplicationContext context;
    AdminBackupController controller;
    UserRepository users;
    ProjectRepository projects;
    DocumentRepository documents;
    PaperSectionRepository sections;
    EvidenceRevisionTraceRepository traces;
    AuditLogRepository audits;

    @Configuration static class Config {
        @Bean ProjectRepository projects() { return mock(ProjectRepository.class); }
        @Bean DocumentRepository documents() { return mock(DocumentRepository.class); }
        @Bean PaperSectionRepository sections() { return mock(PaperSectionRepository.class); }
        @Bean EvidenceRevisionTraceRepository traces() { return mock(EvidenceRevisionTraceRepository.class); }
        @Bean AuditLogRepository audits() { return mock(AuditLogRepository.class); }
        @Bean AdminSeedExportService seedExport() { return mock(AdminSeedExportService.class); }
        @Bean DocumentObjectStorage objectStorage() { return mock(DocumentObjectStorage.class); }
        @Bean AdminBackupController backup(UserRepository u, ProjectRepository p, DocumentRepository d,
                PaperSectionRepository s, EvidenceRevisionTraceRepository t, AuditLogRepository a,
                AdminSeedExportService export, DocumentObjectStorage storage) {
            return new AdminBackupController(u, p, d, s, t, a, export, storage);
        }
    }

    @BeforeEach void setup() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(AdminSeedControllerTest.Config.class, SecurityConfig.class, Config.class);
        context.refresh();
        controller = context.getBean(AdminBackupController.class);
        users = context.getBean(UserRepository.class);
        projects = context.getBean(ProjectRepository.class);
        documents = context.getBean(DocumentRepository.class);
        sections = context.getBean(PaperSectionRepository.class);
        traces = context.getBean(EvidenceRevisionTraceRepository.class);
        audits = context.getBean(AuditLogRepository.class);
        when(users.findAll(any(Pageable.class))).thenReturn(Page.empty());
        when(projects.findAll(any(Pageable.class))).thenReturn(Page.empty());
        when(documents.findAll(any(Pageable.class))).thenReturn(Page.empty());
        when(sections.findAll(any(Pageable.class))).thenReturn(Page.empty());
        when(traces.findAll(any(Pageable.class))).thenReturn(Page.empty());
        when(audits.findAll(any(Pageable.class))).thenReturn(Page.empty());
    }

    @AfterEach void close() { context.close(); org.springframework.security.core.context.SecurityContextHolder.clearContext(); }

    private byte[] export(UUID project) throws Exception {
        // HTTP method security is verified separately; this invokes the actual streaming body.
        authenticate(UserRole.ADMIN);
        var out = new ByteArrayOutputStream();
        controller.backupCsv(project).getBody().writeTo(out);
        return out.toByteArray();
    }

    @Test void csvEscapesWholeExtraCellOnceAndPreservesUnicodeQuotesAndNewlines() throws Exception {
        var project = new Project();
        project.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
        project.setTitle("Đề tài, \"A\"\nDòng hai");
        project.setStatus(ProjectStatus.IN_PROGRESS);
        when(projects.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of(project)));
        byte[] bytes = export(null);
        assertThat(bytes).startsWith((byte) 0xef, (byte) 0xbb, (byte) 0xbf);
        assertThat(new String(bytes, StandardCharsets.UTF_8)).isEqualTo(
                "\uFEFFTABLE,ID,EXTRA\n\"projects\",\"00000000-0000-0000-0000-000000000001\",\"Đề tài, \"\"A\"\"\nDòng hai,IN_PROGRESS\"\n");
    }

    @Test void formulaPrefixesIncludingLeadingWhitespaceRemainText() throws Exception {
        for (String prefix : List.of("=1+1", "+SUM(1,2)", "-1", "@SUM(A1)", "  =1", "\tvalue", " \tvalue", "\rvalue")) {
            var project = new Project();
            project.setId(UUID.randomUUID());
            project.setTitle(prefix);
            project.setStatus(ProjectStatus.IN_PROGRESS);
            when(projects.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of(project)));
            assertThat(new String(export(null), StandardCharsets.UTF_8)).contains(
                    "\"'" + prefix + ",IN_PROGRESS\"");
        }
    }

    @Test void globalExportReadsEveryPageOnceWithBoundedSizeAndIdOrder() throws Exception {
        List<User> rows = IntStream.range(0, 505).mapToObj(i -> {
            var user = new User(); user.setId(new UUID(0, i)); user.setEmail("student" + i + "@fixture.test");
            user.setRole(UserRole.STUDENT); user.setPasswordHash("SENSITIVE_EXPORT_FIXTURE"); return user;
        }).toList();
        when(users.findAll(any(Pageable.class))).thenAnswer(call -> {
            Pageable page = call.getArgument(0);
            assertThat(page.getPageSize()).isEqualTo(500);
            assertThat(page.getSort().getOrderFor("id").isAscending()).isTrue();
            int start = (int) page.getOffset();
            return new PageImpl<>(rows.subList(start, Math.min(start + 500, rows.size())), page, rows.size());
        });
        String csv = new String(export(null), StandardCharsets.UTF_8);
        assertThat(csv.lines().count()).isEqualTo(506);
        assertThat(csv).contains("student504@fixture.test").doesNotContain("SENSITIVE_EXPORT_FIXTURE");
        verify(users, times(2)).findAll(any(Pageable.class));
        verify(users, never()).findAll();
    }

    @Test void projectScopeUsesOnlyScopedQueriesAndUnknownProjectFailsBeforeStreaming() throws Exception {
        UUID id = UUID.randomUUID();
        authenticate(UserRole.ADMIN);
        assertThatThrownBy(() -> controller.backupCsv(id)).isInstanceOfSatisfying(
                org.springframework.web.server.ResponseStatusException.class, ex -> assertThat(ex.getStatusCode().value()).isEqualTo(404));
        var selected = new Project(); selected.setId(id); selected.setTitle("Selected"); selected.setStatus(ProjectStatus.IN_PROGRESS);
        when(projects.findById(id)).thenReturn(Optional.of(selected));
        when(users.findForExport(eq(id), any())).thenReturn(new SliceImpl<>(List.of()));
        when(documents.findByProjectId(eq(id), any())).thenReturn(new SliceImpl<>(List.of()));
        when(sections.findForExport(eq(id), any())).thenReturn(new SliceImpl<>(List.of()));
        when(traces.findForExport(eq(id), any())).thenReturn(new SliceImpl<>(List.of()));
        when(audits.findForExport(eq(id), any())).thenReturn(new SliceImpl<>(List.of()));
        assertThat(new String(export(id), StandardCharsets.UTF_8)).contains("Selected,IN_PROGRESS");
        verify(users, never()).findAll(any(Pageable.class));
        verify(documents, never()).findAll(any(Pageable.class));
        verify(audits).findForExport(eq(id), any());
    }

    @Test void httpRejectsNonAdminAndUnknownProject() throws Exception {
        var mvc = webAppContextSetup(context).addFilters(context.getBean(FilterChainProxy.class)).build();
        mvc.perform(get("/api/admin/backup/csv")).andExpect(status().isUnauthorized());
        for (UserRole role : List.of(UserRole.STUDENT, UserRole.INSTRUCTOR)) {
            authenticate(role);
            mvc.perform(get("/api/admin/backup/csv").header("Authorization", "Bearer fixture")).andExpect(status().isForbidden());
        }
        authenticate(UserRole.ADMIN);
        mvc.perform(get("/api/admin/backup/csv").header("Authorization", "Bearer fixture").param("projectId", UUID.randomUUID().toString())).andExpect(status().isNotFound());
    }

    private void authenticate(UserRole role) {
        var user = new User(); user.setId(UUID.randomUUID()); user.setRole(role);
        user.setAccountStatus(com.evidencepilot.model.enums.AccountStatus.ACTIVE); user.setTokenVersion(0);
        var jwt = context.getBean(com.evidencepilot.config.security.JwtUtils.class);
        when(jwt.validateToken(anyString())).thenReturn(true);
        when(jwt.extractUserId(anyString())).thenReturn(user.getId());
        when(jwt.extractTokenVersion(anyString())).thenReturn(0);
        when(context.getBean(com.evidencepilot.config.security.JwtSessionRegistry.class).isValid(any())).thenReturn(true);
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("fixture", null,
                        List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role))));
    }
}
