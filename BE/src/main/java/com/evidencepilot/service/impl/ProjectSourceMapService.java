package com.evidencepilot.service.impl;

import com.evidencepilot.client.openalex.DoiUtils;
import com.evidencepilot.dto.response.ProjectSourceMapResponse;
import com.evidencepilot.dto.response.ProjectSourceMapResponse.GraphEdge;
import com.evidencepilot.dto.response.ProjectSourceMapResponse.GraphNode;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.enums.EdgeType;
import com.evidencepilot.repository.DocumentReferenceRepository;
import com.evidencepilot.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProjectSourceMapService {
    private final ProjectRepository projectRepository;
    private final CurrentUserServiceImpl currentUserService;
    private final SourceMatchingService sourceMatchingService;
    private final DocumentReferenceRepository referenceRepository;

    @Transactional(readOnly = true)
    public ProjectSourceMapResponse getSourceMap(UUID projectId) {
        var user = currentUserService.requireCurrentUser();
        var project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireProjectAccess(user, project);

        return buildMap(project, 20);
    }

    ProjectSourceMapResponse buildMap(com.evidencepilot.model.Project project) {
        return buildMap(project, Integer.MAX_VALUE);
    }

    private ProjectSourceMapResponse buildMap(com.evidencepilot.model.Project project, int externalLimit) {
        UUID projectId = project.getId();
        var sources = sourceMatchingService.activeSources(projectId);
        String projectNodeId = "project:" + projectId;
        List<GraphNode> nodes = new ArrayList<>();
        List<GraphEdge> edges = new ArrayList<>();
        Set<String> limitations = new LinkedHashSet<>(List.of("SAVED_METADATA_ONLY"));
        Map<UUID, Document> byId = new LinkedHashMap<>();
        Map<String, List<Document>> byDoi = new LinkedHashMap<>();
        Map<String, GraphNode> externalNodes = new LinkedHashMap<>();
        nodes.add(new GraphNode(projectNodeId, "PROJECT", null, project.getTitle(), null,
                null, null, null, null, false));

        for (Document source : sources) {
            byId.put(source.getId(), source);
            String doi = DoiUtils.comparisonKey(source.getDoi());
            if (doi == null) limitations.add("SOURCES_WITHOUT_DOI");
            else byDoi.computeIfAbsent(doi, ignored -> new ArrayList<>()).add(source);
            String title = source.getTitle() == null || source.getTitle().isBlank()
                    ? source.getOriginalFilename() : source.getTitle();
            boolean fileAvailable = source.getFileUrl() != null && !source.getFileUrl().isBlank()
                    && !"pending".equals(source.getFileUrl());
            nodes.add(new GraphNode("source:" + source.getId(), "SOURCE", source.getId(), title,
                    source.getOriginalFilename(), source.getDoi(), source.getAuthors(),
                    source.getPublicationYear(), source.getProcessingStatus(), fileAvailable));
            edges.add(new GraphEdge(projectNodeId, "source:" + source.getId(), "PROJECT_SOURCE", List.of()));
        }
        if (byDoi.values().stream().anyMatch(matches -> matches.size() > 1)) {
            limitations.add("AMBIGUOUS_SOURCE_DOI");
        }

        record Citation(String source, String target) {}
        Map<Citation, Set<UUID>> citations = new LinkedHashMap<>();
        Map<UUID, Integer> externalCounts = new LinkedHashMap<>();
        if (!byId.isEmpty()) {
            for (var reference : referenceRepository.findForDocuments(byId.keySet())) {
                UUID owner = reference.getDocument().getId();
                if (!byId.containsKey(owner)) continue;
                if (reference.getEdgeType() != EdgeType.REFERENCES && reference.getEdgeType() != EdgeType.CITED_BY) continue;
                String doi = DoiUtils.comparisonKey(reference.getDoi());
                var matches = doi == null ? null : byDoi.get(doi);
                if (matches != null && matches.size() != 1) continue;
                String other;
                if (matches != null) {
                    if (owner.equals(matches.getFirst().getId())) continue;
                    other = "source:" + matches.getFirst().getId();
                } else {
                    if (doi == null && (reference.getTitle() == null || reference.getTitle().isBlank())) continue;
                    int count = externalCounts.getOrDefault(owner, 0);
                    if (count >= externalLimit) {
                        limitations.add("EXTERNAL_REFERENCES_LIMITED");
                        continue;
                    }
                    externalCounts.put(owner, count + 1);
                    other = "reference:" + (doi == null ? reference.getId() : doi);
                    externalNodes.putIfAbsent(other, new GraphNode(other, "REFERENCE", null,
                            reference.getTitle() == null || reference.getTitle().isBlank()
                                    ? reference.getDoi() : reference.getTitle(), null,
                            reference.getDoi(), null, reference.getPublicationYear(), null, false));
                }
                Citation citation;
                if (reference.getEdgeType() == EdgeType.REFERENCES) citation = new Citation("source:" + owner, other);
                else citation = new Citation(other, "source:" + owner);
                citations.computeIfAbsent(citation, ignored -> new LinkedHashSet<>()).add(reference.getId());
            }
        }
        nodes.addAll(externalNodes.values());
        citations.forEach((citation, ids) -> edges.add(new GraphEdge(
                citation.source(), citation.target(), "CITES", List.copyOf(ids))));
        return new ProjectSourceMapResponse(new ProjectSourceMapResponse.ProjectNode(projectId, project.getTitle()),
                nodes, edges, List.copyOf(limitations));
    }
}
