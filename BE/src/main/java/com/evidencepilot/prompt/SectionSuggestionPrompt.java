package com.evidencepilot.prompt;

import com.evidencepilot.service.impl.SectionCitationReviewService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;

public final class SectionSuggestionPrompt {

    /** Matches GenerateRequest.prompt in the FastAPI model service. */
    public static final int MAX_PROMPT_CHARS = 48_000;

    private static final int MAX_SECTION_TYPE_CHARS = 200;
    private static final int MAX_CHECKLIST_CHARS = 4_000;
    private static final int MAX_EVIDENCE_JSON_CHARS = 16_000;
    private static final String FULL_STUDENT_HEADING = "\n\nStudent text:\n";
    private static final String EXCERPTED_STUDENT_HEADING = "\n\nStudent text (middle omitted to fit the AI request limit; "
            + "quote only from the excerpt content):\n\nBeginning excerpt:\n";
    private static final String ENDING_EXCERPT_HEADING = "\n\nEnding excerpt:\n";
    private static final String FINAL_INSTRUCTION = "\n\n"
            + "Return the JSON object with a suggestions array exactly as instructed.";

    public static final String SYSTEM = """
            You are an expert academic peer reviewer assisting a university instructor. Analyze the
            student's text against the provided evaluation criteria AND the retrieved evidence chunks.
            NEVER address the student directly. Write in a clinical, academic tone. Output ONLY a valid
            JSON object. No markdown, no conversational text.

            STRICT OUTPUT SCHEMA — always return this top-level object, even for zero or one suggestion:
            {
              "suggestions": [
                {
                  "type": "string, one of: UNSUBSTANTIATED_CLAIM | SOURCE_DISCREPANCY | CLARITY | STRUCTURE | CONVENTION",
                  "issue": "string (max 300 chars)",
                  "quote": "string, exact contiguous text copied from the student text",
                  "actionable_fix": "string (max 300 chars)",
                  "evidence": {
                    "chunk_id": "string UUID from the retrieved evidence list, or null unless type is SOURCE_DISCREPANCY",
                    "source_id": "string UUID from the retrieved evidence list, or null",
                    "quote": "string, verbatim text from that evidence chunk, or null"
                  }
                }
              ]
            }
            RULES:
            - "suggestions" MUST always be an array. Never return a bare suggestion object.
            - Every evidence.chunk_id and evidence.source_id MUST come from the retrieved evidence
              list provided below. Never invent a chunk or source id.
            - evidence.quote MUST be copied verbatim from the text of the named chunk.
            - SOURCE_DISCREPANCY requires evidence; UNSUBSTANTIATED_CLAIM may use null evidence.
            - If the claim is already supported by the retrieved evidence, do NOT flag it.
            - Return {"suggestions": []} ONLY if every criterion is clearly and fully satisfied.
            - Otherwise "suggestions" must contain 1-3 actionable items ordered by severity.
            """;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    public static String build(String sectionType, List<String> checklist, String studentText,
            List<SectionCitationReviewService.RetrievedEvidence> evidence) {
        String normalizedStudentText = studentText == null ? "" : studentText;
        String fullChecklist = checklistText(checklist);
        String fullEvidenceJson = evidenceJson(evidence, Integer.MAX_VALUE);
        String prefix = promptPrefix(sectionType, fullChecklist, fullEvidenceJson);
        if (prefix.length() + FULL_STUDENT_HEADING.length()
                + normalizedStudentText.length() + FINAL_INSTRUCTION.length()
                <= MAX_PROMPT_CHARS) {
            return prefix + FULL_STUDENT_HEADING + normalizedStudentText + FINAL_INSTRUCTION;
        }

        String boundedSectionType = truncate(sectionType, MAX_SECTION_TYPE_CHARS);
        String boundedChecklist = truncate(fullChecklist, MAX_CHECKLIST_CHARS);
        String emptyEvidencePrefix = promptPrefix(boundedSectionType, boundedChecklist, "[]");
        int evidenceBudgetWithFullStudent = MAX_PROMPT_CHARS
                - (emptyEvidencePrefix.length() - "[]".length())
                - FULL_STUDENT_HEADING.length()
                - normalizedStudentText.length()
                - FINAL_INSTRUCTION.length();
        if (evidenceBudgetWithFullStudent >= "[]".length()) {
            prefix = promptPrefix(
                    boundedSectionType,
                    boundedChecklist,
                    evidenceJson(evidence, evidenceBudgetWithFullStudent));
            return prefix + FULL_STUDENT_HEADING + normalizedStudentText + FINAL_INSTRUCTION;
        }

        prefix = promptPrefix(
                boundedSectionType,
                boundedChecklist,
                evidenceJson(evidence, MAX_EVIDENCE_JSON_CHARS));
        int studentBlockBudget = MAX_PROMPT_CHARS - prefix.length() - FINAL_INSTRUCTION.length();
        String studentBlock = studentTextBlock(normalizedStudentText, studentBlockBudget);
        return prefix + studentBlock + FINAL_INSTRUCTION;
    }

    private static String promptPrefix(String sectionType, String checklist, String evidenceJson) {
        return "Section type: " + sectionType + "\n\n"
                + "Evaluation criteria checklist:\n" + checklist
                + "\n\nRetrieved evidence chunks (JSON):\n" + evidenceJson;
    }

    private static String evidenceJson(
            List<SectionCitationReviewService.RetrievedEvidence> evidence, int maxChars) {
        if (evidence == null || evidence.isEmpty()) {
            return "[]";
        }
        List<EvidenceJson> included = new ArrayList<>();
        String serialized = "[]";
        try {
            for (SectionCitationReviewService.RetrievedEvidence item : evidence) {
                if (item == null) {
                    continue;
                }
                included.add(new EvidenceJson(
                        item.sourceId(),
                        item.chunkId(),
                        item.title(),
                        item.text()));
                String candidate = OBJECT_MAPPER.writeValueAsString(included);
                if (candidate.length() > maxChars) {
                    included.remove(included.size() - 1);
                    break;
                }
                serialized = candidate;
            }
            return serialized;
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private static String checklistText(List<String> checklist) {
        if (checklist == null || checklist.isEmpty()) {
            return "";
        }
        return String.join("\n", checklist.stream().map(item -> "- " + item).toList());
    }

    private static String studentTextBlock(String studentText, int maxChars) {
        if (FULL_STUDENT_HEADING.length() + studentText.length() <= maxChars) {
            return FULL_STUDENT_HEADING + studentText;
        }
        int excerptBudget = maxChars
                - EXCERPTED_STUDENT_HEADING.length()
                - ENDING_EXCERPT_HEADING.length();
        int beginningLength = Math.max(0, excerptBudget / 2);
        int endingLength = Math.max(0, excerptBudget - beginningLength);
        return EXCERPTED_STUDENT_HEADING
                + studentText.substring(0, beginningLength)
                + ENDING_EXCERPT_HEADING
                + studentText.substring(studentText.length() - endingLength);
    }

    private static String truncate(String value, int maxChars) {
        if (value == null) {
            return "";
        }
        return value.length() <= maxChars ? value : value.substring(0, maxChars);
    }

    private record EvidenceJson(
            Object sourceId, Object chunkId, String title, String text) {
    }

    private SectionSuggestionPrompt() {
    }
}
