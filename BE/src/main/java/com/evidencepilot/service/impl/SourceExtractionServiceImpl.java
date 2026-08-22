package com.evidencepilot.service.impl;

import com.evidencepilot.config.infrastructure.RabbitMQConfig;
import com.evidencepilot.dto.ExtractionRequest;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.service.SourceExtractionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class SourceExtractionServiceImpl implements SourceExtractionService {

    private final DocumentRepository documentRepository;
    private final RabbitTemplate rabbitTemplate;

    @Override
    public void triggerExtraction(UUID documentId) {
        documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException(documentId, "Document"));
        queueAndPublish(documentId);
    }

    @Scheduled(fixedDelayString = "${extraction.job.sweep-interval-ms:60000}")
    public void reenqueuePendingExtractions() {
        documentRepository.findIdsByProcessingStatusInAndActiveTrue(
                        List.of(ProcessingStatus.UPLOADED, ProcessingStatus.QUEUED))
                .forEach(this::queueAndPublish);
    }

    private void queueAndPublish(UUID documentId) {
        if (documentRepository.queueForExtraction(
                documentId,
                List.of(ProcessingStatus.UPLOADED, ProcessingStatus.QUEUED),
                ProcessingStatus.QUEUED) != 1) {
            return;
        }

        ExtractionRequest request = new ExtractionRequest(documentId);
        try {
            rabbitTemplate.convertAndSend(RabbitMQConfig.EXTRACTION_QUEUE, request);
            log.info("Published document {} to extraction.queue", documentId);
        } catch (AmqpException e) {
            log.error("Failed to publish document {} to extraction.queue; retry scheduled", documentId, e);
        }
    }
}
