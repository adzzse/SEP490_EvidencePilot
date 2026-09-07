package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.CheckpointDiffResponse;
import com.evidencepilot.dto.response.CheckpointSectionBaselineResponse;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.ProjectCheckpoint;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectCheckpointRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CheckpointService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class CheckpointServiceImpl implements CheckpointService {

    private final ProjectCheckpointRepository checkpointRepository;
    private final ProjectRepository projectRepository;
    private final DocumentRepository documentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public void capture(UUID projectId, String trigger) {
        try {
            ObjectNode snapshot = objectMapper.createObjectNode();

            ObjectNode sections = snapshot.putObject("sections");
            for (Document paper : documentRepository
                    .findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER)) {
                for (PaperSection section : paperSectionRepository
                        .findByDocumentIdOrderBySectionOrderAsc(paper.getId())) {
                    if (!section.isActive()) continue;
                    ObjectNode sectionNode = sections.putObject(section.getId().toString());
                    String text = section.getContentTex();
                    sectionNode.put("text", text != null ? text : "");
                    sectionNode.put("words", wordCount(text));
                }
            }

            int answered = 0;
            int unanswered = 0;
            for (InstructorFeedback feedback : instructorFeedbackRepository.findByRequestProjectId(projectId)) {
                if (feedback.getPublishedAt() == null) continue;
                if (feedback.isAnswered()) answered++; else unanswered++;
            }
            snapshot.set("feedback", objectMapper.createObjectNode()
                    .put("answered", answered)
                    .put("unanswered", unanswered));

            ProjectCheckpoint checkpoint = new ProjectCheckpoint();
            checkpoint.setProject(projectRepository.findById(projectId).orElse(null));
            checkpoint.setTrigger(trigger);
            checkpoint.setSnapshotJson(objectMapper.writeValueAsString(snapshot));
            checkpoint.setCreatedAt(LocalDateTime.now());
            checkpointRepository.save(checkpoint);
        } catch (Exception e) {
            // checkpoint must never break the submit/review flow
            log.warn("Checkpoint capture failed for project {}: {}", projectId, e.getMessage());
        }
    }

    @Override
    public CheckpointDiffResponse getDiff(UUID projectId) {
        List<ProjectCheckpoint> checkpoints = checkpointRepository
                .findByProjectIdOrderByCreatedAtDesc(projectId);
        if (checkpoints.size() < 2) {
            return new CheckpointDiffResponse(projectId, null, null, null, null,
                    0, List.of());
        }
        JsonNode newest = parse(checkpoints.get(0).getSnapshotJson());
        JsonNode previous = parse(checkpoints.get(1).getSnapshotJson());

        Map<String, Integer> prevWords = wordMap(previous.path("sections"));
        Map<String, Integer> newWords = wordMap(newest.path("sections"));
        List<CheckpointDiffResponse.WordCountDelta> wordDeltas = new ArrayList<>();
        java.util.Set<String> allSectionIds = new java.util.LinkedHashSet<>();
        allSectionIds.addAll(prevWords.keySet());
        allSectionIds.addAll(newWords.keySet());
        for (String id : allSectionIds) {
            int from = prevWords.getOrDefault(id, 0);
            int to = newWords.getOrDefault(id, 0);
            if (from != to) {
                wordDeltas.add(new CheckpointDiffResponse.WordCountDelta(
                        UUID.fromString(id), from, to));
            }
        }

        int feedbackAnsweredDelta = newest.path("feedback").path("answered").asInt()
                - previous.path("feedback").path("answered").asInt();

        return new CheckpointDiffResponse(
                projectId,
                checkpoints.get(1).getCreatedAt(),
                checkpoints.get(0).getCreatedAt(),
                checkpoints.get(1).getTrigger(),
                checkpoints.get(0).getTrigger(),
                feedbackAnsweredDelta,
                wordDeltas);
    }

    @Override
    public CheckpointSectionBaselineResponse getLatestSectionBaseline(
            UUID projectId, UUID sectionId, LocalDateTime before) {
        List<ProjectCheckpoint> checkpoints = checkpointRepository
                .findByProjectIdOrderByCreatedAtDesc(projectId);
        ProjectCheckpoint baseline = null;
        for (ProjectCheckpoint checkpoint : checkpoints) {
            if (before != null && (checkpoint.getCreatedAt() == null
                    || !checkpoint.getCreatedAt().isBefore(before))) {
                continue;
            }
            baseline = checkpoint;
            break;
        }
        if (baseline == null) return null;
        JsonNode snapshot = parse(baseline.getSnapshotJson());
        JsonNode section = snapshot.path("sections").path(sectionId.toString());
        String text = section.isObject() ? section.path("text").asText(null) : null;
        if (text == null) return null;
        return new CheckpointSectionBaselineResponse(
                text, baseline.getTrigger(), baseline.getCreatedAt());
    }

    private static Map<String, Integer> wordMap(JsonNode sections) {
        Map<String, Integer> map = new LinkedHashMap<>();
        sections.fields().forEachRemaining(entry -> {
            JsonNode value = entry.getValue();
            int words = value.isObject() ? value.path("words").asInt() : value.asInt();
            map.put(entry.getKey(), words);
        });
        return map;
    }

    private JsonNode parse(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            return objectMapper.createObjectNode();
        }
    }

    private static int wordCount(String contentTex) {
        if (contentTex == null || contentTex.isBlank()) return 0;
        return contentTex.trim().split("\\s+").length;
    }
}
