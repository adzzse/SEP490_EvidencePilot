package com.evidencepilot.service;

import com.evidencepilot.model.ExportJob;
import org.springframework.core.io.Resource;

import java.util.List;
import java.util.UUID;

public interface ExportService {
    ExportJob createExportJob(UUID projectId, String format);
    ExportJob retryExport(UUID jobId);
    ExportJob getJob(UUID jobId);
    Resource downloadExport(UUID jobId);
    List<ExportJob> getUserExports(UUID projectId);
}
