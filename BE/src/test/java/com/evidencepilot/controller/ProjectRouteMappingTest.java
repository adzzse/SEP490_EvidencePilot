package com.evidencepilot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.evidencepilot.dto.response.ProjectMemberResponse;

import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;

class ProjectRouteMappingTest {

    private static final Class<?>[] CONTROLLERS = {
            AdminController.class,
            AuthController.class,
            CollectionController.class,
            DocumentController.class,
            FeedbackController.class,
            HealthController.class,
            OpenAlexController.class,
            PaperController.class,
            ProjectController.class,
            CollectionCategoryController.class,
            ProgressReportController.class,
            CheckpointController.class,
            SourceController.class,
            SystemNotificationController.class,
            TraceabilityExportController.class,
            UserController.class,
            JobController.class,
            TraceTelemetryController.class,
            SectionStandardController.class
    };

    @Test
    void exposesExactlyTheDocumentedRoutes() {
        Set<String> routes = Arrays.stream(CONTROLLERS)
                .flatMap(ProjectRouteMappingTest::controllerRoutes)
                .collect(Collectors.toSet());

        assertThat(routes).containsExactlyInAnyOrderElementsOf(Set.of(
                "POST /api/auth/login",
                "POST /api/auth/refresh",
                "POST /api/auth/update-password",
                "POST /api/auth/password-reset/request",
                "POST /api/auth/password-reset/confirm",
                "GET /api/users",
                "GET /api/users/{id}",
                "GET /api/users/profile",
                "PUT /api/users/profile",
                "GET /api/projects",
                "GET /api/projects/{id}",
                "POST /api/projects",
                "PUT /api/projects/{id}",
                "PATCH /api/projects/{id}/complete",
                "PATCH /api/projects/{id}/archive",
                "PATCH /api/projects/{id}/unarchive",
                "DELETE /api/projects/{id}",
                "GET /api/projects/{id}/members",
                "GET /api/projects/{projectId}/documents",
                "GET /api/projects/{projectId}/sources",
                "GET /api/projects/{projectId}/collections",
                "PUT /api/projects/{projectId}/collections/{collectionId}",
                "DELETE /api/projects/{projectId}/collections/{collectionId}",
                "POST /api/projects/{id}/members",
                "PATCH /api/projects/{id}/members/{userId}",
                "GET /api/projects/{projectId}/export",
                "DELETE /api/projects/{id}/members/{userId}",
                "GET /api/collections",
                "POST /api/collections",
                "GET /api/collections/{id}",
                "PUT /api/collections/{id}",
                "GET /api/collections/{id}/sources",
                "GET /api/collections/{id}/library-sources",
                "GET /api/collections/{id}/citation-graph",
                "POST /api/collections/{collectionId}/sources/{sourceId}",
                "DELETE /api/collections/{collectionId}/sources/{sourceId}",
                "POST /api/collections/{collectionId}/sources/{sourceId}/share-to-project/{projectId}",
                "DELETE /api/collections/{id}",
                "GET /api/documents/{id}",
                "POST /api/documents",
                "POST /api/documents/lookup",
                "POST /api/documents/ingest/doi",
                "POST /api/documents/ingest/doi/batch",
                "POST /api/documents/{documentId}/file",
                "POST /api/documents/{id}/re-extract",
                "GET /api/documents/{id}/chunks",
                "GET /api/documents/{id}/text",
                "PUT /api/documents/{id}/text",
                "GET /api/documents/{id}/download",
                "GET /api/documents/{id}/diagnostics",
                "DELETE /api/documents/{id}",
                "GET /api/papers",
                "GET /api/papers/{id}",
                "GET /api/projects/{projectId}/papers",
                "GET /api/papers/{id}/sections",
                "GET /api/papers/{documentId}/sections/{sectionId}/history",
                "PUT /api/papers/{documentId}/sections/{sectionId}",
                "PUT /api/papers/{documentId}/sections/batch",
                "POST /api/papers/{documentId}/sections/create",
                "GET /api/papers/{id}/validate",
                "GET /api/papers/{id}/validate-citations",
                "GET /api/papers/{id}/standard-suggestion",
                "POST /api/papers/{documentId}/sections/{sectionId}/review",
                "GET /api/papers/{documentId}/sections/{sectionId}/review",
                "POST /api/papers/{documentId}/sections/{sectionId}/review/source-matches",
                "POST /api/papers/{documentId}/sections/{sectionId}/suggestions",
                "DELETE /api/papers/{id}",
                "POST /api/papers",
                "GET /api/sources",
                "GET /api/sources/projects/{projectId}",
                "GET /api/sources/{id}",
                "POST /api/sources",
                "PUT /api/sources/{id}",
                "DELETE /api/sources/{id}",
                "DELETE /api/sources/projects/{projectId}/sources/{sourceId}",
                "GET /api/collection-categories",
                "GET /api/admin/collection-categories",
                "POST /api/admin/collection-categories",
                "PUT /api/admin/collection-categories/{id}",
                "DELETE /api/admin/collection-categories/{id}",
                "GET /api/admin/users",
                "POST /api/admin/users",
                "POST /api/admin/users/import",
                "PATCH /api/admin/users/{id}/status",
                "DELETE /api/admin/users/{id}",
                "POST /api/admin/users/{id}/password-reset",
                "GET /api/admin/dashboard",
                "GET /api/admin/audit-logs",
                "POST /api/admin/notifications/broadcast",
                "GET /api/feedback-requests",
                "GET /api/feedback-requests/{id}/feedback",
                "POST /api/projects/{projectId}/reviews",
                "POST /api/feedback-requests/{id}/feedback",
                "PATCH /api/feedback-requests/{id}/status",
                "POST /api/instructor-feedback/{id}/answer",
                "PATCH /api/instructor-feedback/{id}",
                "DELETE /api/instructor-feedback/{id}",
                "GET /api/notifications",
                "GET /api/notifications/unread-count",
                "PATCH /api/notifications/{id}/read",
                "GET /api/projects/{projectId}/traceability",
                "GET /api/projects/{projectId}/traceability/csv",
                "GET /api/projects/{projectId}/progress-report",
                "GET /api/projects/{projectId}/checkpoints/diff",
                "GET /api/projects/{projectId}/checkpoints/latest/sections/{sectionId}",
                "GET /api/health",
                "GET /api/health/live",
                "GET /api/health/ready",
                "GET /api/admin/collections",
                "GET /api/admin/notifications/broadcast-history",
                "GET /api/admin/documents/extraction-queue",
                "GET /api/admin/documents",
                "GET /api/admin/documents/counts",
                "GET /api/admin/projects",
                "GET /api/admin/config",
                "DELETE /api/papers/{documentId}/sections/{sectionId}",
                "PUT /api/papers/{documentId}/sections/{sectionId}/assign",
                "POST /api/papers/{documentId}/sections/{sectionId}/rollback",
                "PUT /api/papers/{id}",
                "POST /api/projects/{projectId}/papers/init",
                "POST /api/projects/{projectId}/papers/reset-standard",
                "GET /api/jobs/{jobId}",
                "PATCH /api/papers/{documentId}/sections/{sectionId}/traces/{traceId}",
                "GET /api/papers/{documentId}/sections/{sectionId}/traces",
                "GET /api/projects/{projectId}/evidence-traces",
                "GET /api/projects/{projectId}/telemetry",
                "PATCH /api/projects/{projectId}/evidence-traces/{traceId}/review",
                "POST /api/papers/{documentId}/sections/{sectionId}/standard-evaluation",
                "GET /api/papers/{documentId}/sections/{sectionId}/standard-evaluation",
                "PUT /api/papers/{documentId}/sections/{sectionId}/standard-evaluation/config",
                "POST /api/sources/batch",
                "POST /api/collections/{collectionId}/sources/batch",
                "POST /api/users/email-change/request",
                "POST /api/users/email-change/confirm",
                "DELETE /api/users/email-change/cancel",
                "GET /api/users/me/telemetry"));
        assertThat(routes).hasSize(136);
    }

    @Test
    void projectListRoutesDoNotExposeDoubledResourcePrefixes() {
        Set<String> paths = Arrays.stream(new Class<?>[] {
                ProjectController.class,
                PaperController.class,
                DocumentController.class,
                SourceController.class,
                CollectionController.class
        })
                .map(ProjectRouteMappingTest::controllerPaths)
                .flatMap(Set::stream)
                .collect(Collectors.toSet());

        assertThat(paths).contains(
                "/api/projects/{projectId}/papers",
                "/api/projects/{projectId}/documents",
                "/api/projects/{projectId}/sources");
        assertThat(paths).doesNotContain(
                "/api/papers/api/projects/{projectId}/papers",
                "/api/documents/api/projects/{projectId}/documents",
                "/api/sources/api/projects/{projectId}/sources");
    }

    @Test
    void projectMembersRouteReturnsDtoInsteadOfJpaEntity() throws NoSuchMethodException {
        Method method = ProjectController.class.getDeclaredMethod("getProjectMembers", java.util.UUID.class);

        assertThat(method.getReturnType()).isEqualTo(List.class);
        ParameterizedType returnType = (ParameterizedType) method.getGenericReturnType();
        assertThat(returnType.getActualTypeArguments()[0]).isEqualTo(ProjectMemberResponse.class);
    }

    @Test
    void userSelfServiceRouteMatchesSecurityConfig() {
        Set<String> paths = controllerPaths(UserController.class);

        assertThat(paths).contains("/api/users/profile");
        assertThat(paths).doesNotContain("/api/users/me");
    }

    private static Set<String> controllerPaths(Class<?> controller) {
        return controllerRoutes(controller)
                .map(route -> route.substring(route.indexOf(' ') + 1))
                .collect(Collectors.toSet());
    }

    private static Stream<String> controllerRoutes(Class<?> controller) {
        RequestMapping classMapping = controller.getAnnotation(RequestMapping.class);
        String[] prefixes = classMapping == null || classMapping.value().length == 0
                ? new String[] {""}
                : classMapping.value();

        return Arrays.stream(controller.getDeclaredMethods())
                .flatMap(ProjectRouteMappingTest::methodRoutes)
                .flatMap(route -> Arrays.stream(prefixes)
                        .map(prefix -> route.method() + " " + combine(prefix, route.path())));
    }

    private static Stream<Route> methodRoutes(Method method) {
        if (method.isAnnotationPresent(GetMapping.class)) {
            return routes("GET", method.getAnnotation(GetMapping.class).value());
        }
        if (method.isAnnotationPresent(PostMapping.class)) {
            return routes("POST", method.getAnnotation(PostMapping.class).value());
        }
        if (method.isAnnotationPresent(PutMapping.class)) {
            return routes("PUT", method.getAnnotation(PutMapping.class).value());
        }
        if (method.isAnnotationPresent(PatchMapping.class)) {
            return routes("PATCH", method.getAnnotation(PatchMapping.class).value());
        }
        if (method.isAnnotationPresent(DeleteMapping.class)) {
            return routes("DELETE", method.getAnnotation(DeleteMapping.class).value());
        }
        return Stream.empty();
    }

    private static Stream<Route> routes(String method, String[] paths) {
        return paths.length == 0
                ? Stream.of(new Route(method, ""))
                : Arrays.stream(paths).map(path -> new Route(method, path));
    }

    private static String combine(String prefix, String path) {
        if (path.isBlank()) {
            return prefix;
        }
        return prefix + path;
    }

    private record Route(String method, String path) {}
}
