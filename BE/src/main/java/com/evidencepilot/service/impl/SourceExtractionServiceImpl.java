package com.evidencepilot.service.impl;

import com.evidencepilot.config.infrastructure.RabbitMQConfig;
import com.evidencepilot.dto.ExtractionRequest;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.service.SourceExtractionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class SourceExtractionServiceImpl implements SourceExtractionService {

    private final DocumentRepository documentRepository;
    private final RabbitTemplate rabbitTemplate;

    @Override
    public void triggerExtraction(UUID documentId) {
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException(documentId, "Document"));
        document.setProcessingStatus(ProcessingStatus.QUEUED);
        document.setProcessingError(null);
        document.setProcessedAt(null);
        documentRepository.save(document);

        // ponytail: direct publish may leave QUEUED after a process crash;
        // add an outbox only when delivery must be guaranteed.
        ExtractionRequest request = new ExtractionRequest(document.getId());
        try {
            rabbitTemplate.convertAndSend(RabbitMQConfig.EXTRACTION_QUEUE, request);
            log.info("Published document {} to extraction.queue", documentId);
        } catch (AmqpException e) {
            document.setProcessingStatus(ProcessingStatus.FAILED);
            document.setProcessingError("Failed to queue extraction");
            document.setProcessedAt(LocalDateTime.now());
            documentRepository.save(document);
            log.error("Failed to publish document {} to extraction.queue", documentId, e);
        }
    }
}
