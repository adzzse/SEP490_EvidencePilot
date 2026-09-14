package com.evidencepilot.service.listener;

import com.evidencepilot.config.infrastructure.RabbitMQConfig;
import com.evidencepilot.service.AiEvaluationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class AiEvaluationListener {

    private final AiEvaluationService aiEvaluationService;

    @RabbitListener(queues = RabbitMQConfig.AI_EVALUATION_QUEUE,
            containerFactory = "aiEvaluationListenerContainerFactory")
    public void handle(Map<String, Object> message) {
        process(message);
    }

    @RabbitListener(queues = RabbitMQConfig.AI_EVALUATION_DLQ)
    public void handleDeadLetter(Map<String, Object> message) {
        Object jobId = message.get("jobId");
        if (jobId == null) {
            log.error("DLQ message without jobId: {}", message);
            return;
        }
        aiEvaluationService.markFailed(UUID.fromString(String.valueOf(jobId)),
                "AI evaluation failed after retries; message moved to DLQ");
    }

    private void process(Map<String, Object> message) {
        Object jobId = message.get("jobId");
        if (jobId != null) {
            aiEvaluationService.process(UUID.fromString(String.valueOf(jobId)));
        }
    }
}
