package com.evidencepilot.controller;

import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.request.SubmitReviewRequest;
import com.evidencepilot.service.impl.FeedbackServiceImpl;
import com.evidencepilot.service.SubmissionReadinessService;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.dto.response.FeedbackRequestPageResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;
import java.time.LocalDate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class FeedbackControllerTest {

    private final FeedbackServiceImpl service = mock(FeedbackServiceImpl.class);
    private final SubmissionReadinessService submissionReadinessService = mock(SubmissionReadinessService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = standaloneSetup(new FeedbackController(service, submissionReadinessService)).build();
    }

    @Test
    void findAll_delegatesToCurrentUserScope() throws Exception {
        mockMvc.perform(get("/api/feedback-requests")).andExpect(status().isOk());
        verify(service).findAllForCurrentUser();
    }

    @Test
    void queueBindsServerSideFiltersAndPagination() throws Exception {
        UUID projectId = UUID.randomUUID();
        when(service.findQueueForCurrentUser(2, 15, projectId, FeedbackStatus.PENDING,
                LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 21), "capstone"))
                .thenReturn(new FeedbackRequestPageResponse(java.util.List.of(), 2, 15, 0, 0));

        mockMvc.perform(get("/api/feedback-requests/queue")
                        .param("page", "2")
                        .param("size", "15")
                        .param("projectId", projectId.toString())
                        .param("status", "PENDING")
                        .param("dateFrom", "2026-09-01")
                        .param("dateTo", "2026-09-21")
                        .param("search", "capstone"))
                .andExpect(status().isOk());

        verify(service).findQueueForCurrentUser(2, 15, projectId, FeedbackStatus.PENDING,
                LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 21), "capstone");
    }

    @Test
    void submitForReview_returns201() throws Exception {
        UUID projectId = UUID.randomUUID();
        String fingerprint = "a".repeat(64);
        mockMvc.perform(post("/api/projects/{id}/reviews", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedSubmissionFingerprint\":\"" + fingerprint + "\"}"))
                .andExpect(status().isCreated());
        verify(service).submitForReview(eq(projectId), any(SubmitReviewRequest.class));
    }

    @Test
    void comment_bindsRequest() throws Exception {
        UUID requestId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        mockMvc.perform(post("/api/feedback-requests/{id}/feedback", requestId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sectionId\":\"" + sectionId + "\",\"lineReference\":\"L2\",\"content\":\"Revise this\"}"))
                .andExpect(status().isOk());
        verify(service).comment(eq(requestId), any(InstructorFeedbackRequest.class));
    }

    @Test
    void comment_rejectsBlankContent() throws Exception {
        mockMvc.perform(post("/api/feedback-requests/{id}/feedback", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sectionId\":\"" + UUID.randomUUID() + "\",\"content\":\" \"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void comment_rejectsOversizedLineReference() throws Exception {
        String longRef = "L".repeat(101);
        mockMvc.perform(post("/api/feedback-requests/{id}/feedback", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sectionId\":\"" + UUID.randomUUID()
                                + "\",\"lineReference\":\"" + longRef + "\",\"content\":\"Revise\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void updateStatus_bindsStatus() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(patch("/api/feedback-requests/{id}/status", id).param("status", "REVIEWED"))
                .andExpect(status().isOk());
        verify(service).updateStatus(id, "REVIEWED");
    }

    @Test
    void getFeedbackItems_returnsItems() throws Exception {
        UUID requestId = UUID.randomUUID();
        mockMvc.perform(get("/api/feedback-requests/{id}/feedback", requestId))
                .andExpect(status().isOk());
        verify(service).getFeedbackItems(requestId, null);
    }

    @Test
    void getFeedbackItems_bindsOptionalSectionId() throws Exception {
        UUID requestId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        mockMvc.perform(get("/api/feedback-requests/{id}/feedback", requestId)
                        .param("sectionId", sectionId.toString()))
                .andExpect(status().isOk());
        verify(service).getFeedbackItems(requestId, sectionId);
    }

    @Test
    void updateFeedbackItem_bindsRequest() throws Exception {
        UUID itemId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        mockMvc.perform(patch("/api/instructor-feedback/{id}", itemId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sectionId\":\"" + sectionId + "\",\"lineReference\":\"L3\",\"content\":\"Reworded\"}"))
                .andExpect(status().isOk());
        verify(service).updateFeedbackItem(eq(itemId), any(InstructorFeedbackRequest.class));
    }

    @Test
    void deleteFeedbackItem_returns204() throws Exception {
        UUID itemId = UUID.randomUUID();
        mockMvc.perform(delete("/api/instructor-feedback/{id}", itemId))
                .andExpect(status().isNoContent());
        verify(service).deleteFeedbackItem(itemId);
    }

    @Test
    void retiredConversationRoutesAreNotAvailable() throws Exception {
        UUID itemId = UUID.randomUUID();
        UUID replyId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        // Reply, thread-state, and reply-mutation routes are retired with the
        // one-way feedback model; only reads and root create/update/delete stay.
        for (var request : java.util.List.of(
                post("/api/instructor-feedback/{id}/answer", itemId),
                patch("/api/instructor-feedback/{id}/replies/{replyId}", itemId, replyId),
                delete("/api/instructor-feedback/{id}/replies/{replyId}", itemId, replyId),
                post("/api/instructor-feedback/{id}/replies", itemId),
                patch("/api/instructor-feedback/{id}/state", itemId),
                patch("/api/instructor-feedback/{id}/anchor", itemId))) {
            mockMvc.perform(request.contentType(MediaType.APPLICATION_JSON)
                            .content("{\"requestId\":\"" + cycleId
                                    + "\",\"content\":\"Old reply\",\"state\":\"RESOLVED\",\"expectedRevision\":0}"))
                    .andExpect(status().isNotFound());
        }
        verifyNoInteractions(service);
    }

    @Test
    void comparisonSource_bindsRequestAndSection() throws Exception {
        UUID requestId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        when(service.getComparisonSource(eq(requestId), eq(sectionId)))
                .thenReturn(new com.evidencepilot.dto.response.ComparisonSourceDto(
                        new com.evidencepilot.dto.response.ComparisonSourceDto.Submitted("new", 2),
                        new com.evidencepilot.dto.response.ComparisonSourceDto.Baseline(
                                "old", 1,
                                com.evidencepilot.dto.response.ComparisonSourceDto.Baseline.INITIAL_ASSIGNMENT)));
        mockMvc.perform(get("/api/feedback-requests/{id}/comparison-source", requestId)
                        .param("sectionId", sectionId.toString()))
                .andExpect(status().isOk());
        verify(service).getComparisonSource(requestId, sectionId);
    }

    @Test
    void comparisonSource_requiresSectionId() throws Exception {
        mockMvc.perform(get("/api/feedback-requests/{id}/comparison-source", UUID.randomUUID()))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
