package com.evidencepilot.service;

import com.evidencepilot.dto.response.ProgressReportResponse;
import java.time.LocalDate;
import java.util.UUID;

public interface ProgressReportService {
    ProgressReportResponse getProgressReport(
            UUID projectId, String memberFilter, LocalDate from, LocalDate to);
}
