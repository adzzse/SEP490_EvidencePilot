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
import com.evidencepilot.service.CurrentUserService;
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
    private final CurrentUserService currentUserService;
    private final SourceMatchingService sourceMatchingService;
    private final DocumentReferenceRepository referenceRepository;

    @Transactional(readOnly = true)
    public ProjectSourceMapResponse getSourceMap(UUID projectId) {
        var user = currentUserService.requireCurrentUser();
        var project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireProjectAccess(user, project);

        var sources = sourceMatchingService.activeSources(projectId);
        String projectNodeId = "project:" + projectId;
        List<GraphNode> nodes = new ArrayList<>();
        List<GraphEdge> edges = new ArrayList<>();
        Set<String> limitations = new LinkedHashSet<>(List.of("SAVED_METADATA_ONLY"));
        Map<UUID, Document> byId = new LinkedHashMap<>();
        Map<String, List<Document>> byDoi = new LinkedHashMap<>();
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

        record Citation(UUID source, UUID target) {}
        Map<Citation, Set<UUID>> citations = new LinkedHashMap<>();
        if (!byId.isEmpty()) {
            for (var reference : referenceRepository.findForDocuments(byId.keySet())) {
                UUID owner = reference.getDocument().getId();
                if (!byId.containsKey(owner)) continue;
                String doi = DoiUtils.comparisonKey(reference.getDoi());
                var matches = doi == null ? null : byDoi.get(doi);
                if (matches == null || matches.size() != 1) continue;
                UUID other = matches.getFirst().getId();
                if (owner.equals(other)) continue;
                Citation citation;
                if (reference.getEdgeType() == EdgeType.REFERENCES) citation = new Citation(owner, other);
                else if (reference.getEdgeType() == EdgeType.CITED_BY) citation = new Citation(other, owner);
                else continue;
                citations.computeIfAbsent(citation, ignored -> new LinkedHashSet<>()).add(reference.getId());
            }
        }
        citations.forEach((citation, ids) -> edges.add(new GraphEdge(
                "source:" + citation.source(), "source:" + citation.target(), "CITES", List.copyOf(ids))));
        return new ProjectSourceMapResponse(new ProjectSourceMapResponse.ProjectNode(projectId, project.getTitle()),
                nodes, edges, List.copyOf(limitations));
    }
}
