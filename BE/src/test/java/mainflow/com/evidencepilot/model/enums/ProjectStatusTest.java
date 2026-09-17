package com.evidencepilot.model.enums;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProjectStatusTest {

    @Test
    void onlyApprovedAndArchivedAreReadOnly() {
        assertThat(ProjectStatus.APPROVED.isReadOnly()).isTrue();
        assertThat(ProjectStatus.ARCHIVED.isReadOnly()).isTrue();
        assertThat(ProjectStatus.ASSIGNED.isReadOnly()).isFalse();
        assertThat(ProjectStatus.IN_PROGRESS.isReadOnly()).isFalse();
        assertThat(ProjectStatus.SUBMITTED_FOR_REVIEW.isReadOnly()).isFalse();
        assertThat(ProjectStatus.RETURNED.isReadOnly()).isFalse();
    }

    @Test
    void returnedProjectsCanReenterTheReviewLoop() {
        assertThat(ProjectStatus.RETURNED.canTransitionTo(ProjectStatus.SUBMITTED_FOR_REVIEW)).isTrue();
        assertThat(ProjectStatus.RETURNED.canTransitionTo(ProjectStatus.APPROVED)).isTrue();
        assertThat(ProjectStatus.RETURNED.canTransitionTo(ProjectStatus.IN_PROGRESS)).isTrue();
        assertThat(ProjectStatus.RETURNED.canTransitionTo(ProjectStatus.ARCHIVED)).isFalse();
    }

    @Test
    void illegalAndTerminalTransitionsAreRejected() {
        assertThat(ProjectStatus.APPROVED.canTransitionTo(ProjectStatus.ARCHIVED)).isTrue();
        assertThat(ProjectStatus.APPROVED.canTransitionTo(ProjectStatus.IN_PROGRESS)).isFalse();
        assertThat(ProjectStatus.ARCHIVED.canTransitionTo(ProjectStatus.APPROVED)).isTrue();
        assertThat(ProjectStatus.CREATED.canTransitionTo(ProjectStatus.APPROVED)).isFalse();
        assertThat(ProjectStatus.SUBMITTED_FOR_REVIEW.canTransitionTo(ProjectStatus.RETURNED)).isTrue();
        assertThat(ProjectStatus.SUBMITTED_FOR_REVIEW.canTransitionTo(ProjectStatus.ARCHIVED)).isFalse();
        assertThat(ProjectStatus.IN_PROGRESS.canTransitionTo(null)).isFalse();
    }
}
