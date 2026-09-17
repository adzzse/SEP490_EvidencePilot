package com.evidencepilot.service;

import com.evidencepilot.model.AiEvaluationJob;
import com.evidencepilot.repository.AiEvaluationJobRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class AiJobProgressTest {
    @Autowired
    private AiEvaluationJobRepository jobs;

    private AiEvaluationJob processing(LocalDateTime started) {
        AiEvaluationJob job = new AiEvaluationJob();
        job.setProjectId(UUID.randomUUID());
        job.setKind(AiEvaluationJob.KIND_SECTION_CITATION_REVIEW);
        job.setPayloadJson("{}");
        job.setStatus(AiEvaluationJob.STATUS_PENDING);
        job.setCreatedAt(started);
        job = jobs.saveAndFlush(job);
        assertThat(jobs.claimPending(job.getId(), started)).isEqualTo(1);
        return job;
    }

    @Test
    void progressingJobCanRunLongerThanThirtyMinutes() {
        LocalDateTime now = LocalDateTime.now();
        AiEvaluationJob job = processing(now.minusHours(2));
        assertThat(jobs.updateProgress(job.getId(), 7, 20, now)).isEqualTo(1);
        jobs.failStuck(now.minusMinutes(30), now, "No progress");
        assertThat(jobs.findById(job.getId()).orElseThrow().getStatus()).isEqualTo(AiEvaluationJob.STATUS_PROCESSING);
        assertThat(jobs.updateProgress(job.getId(), 7, 20, now.plusMinutes(1))).isZero();
        assertThat(jobs.findById(job.getId()).orElseThrow().getLastProgressAt()).isBefore(now.plusSeconds(1));
    }

    @Test
    void sweeperPreservesCheckpointAndLateWorkerCannotResurrectJob() {
        LocalDateTime now = LocalDateTime.now();
        AiEvaluationJob job = processing(now.minusHours(2));
        String partial = "{\"complete\":false,\"findings\":[{\"excerpt\":\"checked\"}]}";
        assertThat(jobs.saveCheckpoint(job.getId(), partial)).isEqualTo(1);
        jobs.failStuck(now.minusMinutes(30), now, "No progress");
        assertThat(jobs.finishProcessing(job.getId(), AiEvaluationJob.STATUS_SUCCESS, "{}", null, now)).isZero();
        assertThat(jobs.updateProgress(job.getId(), 8, 20, now)).isZero();
        assertThat(jobs.saveCheckpoint(job.getId(), "{}")).isZero();
        AiEvaluationJob saved = jobs.findById(job.getId()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(AiEvaluationJob.STATUS_FAILED);
        assertThat(saved.getResultJson()).isEqualTo(partial);
    }

    @Test
    void finalizationWinsBeforeSweeperAndDlq() {
        LocalDateTime now = LocalDateTime.now();
        AiEvaluationJob job = processing(now.minusHours(2));
        assertThat(jobs.finishProcessing(job.getId(), AiEvaluationJob.STATUS_SUCCESS, "{\"complete\":true}", null, now)).isEqualTo(1);
        jobs.failStuck(now.minusMinutes(30), now, "No progress");
        assertThat(jobs.failActive(job.getId(), "Late delivery", now)).isZero();
        assertThat(jobs.findById(job.getId()).orElseThrow().getStatus()).isEqualTo(AiEvaluationJob.STATUS_SUCCESS);
    }
}
