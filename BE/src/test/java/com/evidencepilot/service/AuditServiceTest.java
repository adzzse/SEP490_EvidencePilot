package com.evidencepilot.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.evidencepilot.model.enums.AuditSeverity;

class AuditServiceTest {

    @ParameterizedTest
    @ValueSource(strings = {"USER_BANNED", "USER_DELETED", "PROJECT_DELETED", "EXPORT_FAILED"})
    void destructiveAndFailedActionsAreCritical(String action) {
        assertThat(AuditService.severityOf(action)).isEqualTo(AuditSeverity.CRITICAL);
    }

    @ParameterizedTest
    @ValueSource(strings = {"INVITATION_EXPIRED", "PASSWORD_RESET_REQUESTED", "REVIEW_REJECTED", "PROJECT_RETURNED"})
    void expiriesRejectionsAndResetsAreWarn(String action) {
        assertThat(AuditService.severityOf(action)).isEqualTo(AuditSeverity.WARN);
    }

    @ParameterizedTest
    @ValueSource(strings = {"USER_CREATED", "PROJECT_UPDATED", "NOTIFICATION_BROADCAST", "INVITATION_ACCEPTED"})
    void routineActionsAreInfo(String action) {
        assertThat(AuditService.severityOf(action)).isEqualTo(AuditSeverity.INFO);
    }

    @Test
    void nullActionDefaultsToInfo() {
        assertThat(AuditService.severityOf(null)).isEqualTo(AuditSeverity.INFO);
    }
}
