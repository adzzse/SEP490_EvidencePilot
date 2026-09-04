package com.evidencepilot.controller;

import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.request.SubmitReviewRequest;
import com.evidencepilot.service.FeedbackService;
import com.evidencepilot.service.SubmissionReadinessService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class FeedbackControllerTest {

    private final FeedbackService service = mock(FeedbackService.class);
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
        verify(service).getFeedbackItems(requestId);
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
}
