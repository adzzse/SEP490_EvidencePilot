package com.evidencepilot.service.listener;

import com.evidencepilot.config.infrastructure.RabbitMQConfig;
import com.evidencepilot.dto.ExtractionRequest;
import com.evidencepilot.service.DocumentExtractionWorker;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class DocumentExtractionListener {

    private final DocumentExtractionWorker worker;

    @RabbitListener(queues = RabbitMQConfig.EXTRACTION_QUEUE,
            containerFactory = "extractionListenerContainerFactory")
    public void handle(ExtractionRequest request) {
        worker.process(request.documentId());
    }
}
