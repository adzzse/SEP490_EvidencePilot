package com.evidencepilot.config.infrastructure;

import com.evidencepilot.dto.ExtractionRequest;
import com.evidencepilot.service.impl.DocumentPersistenceService;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.retry.MessageRecoverer;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    public static final String EXTRACTION_QUEUE = "extraction.queue";
    public static final String EXTRACTION_DLQ = "extraction.dlq";
    public static final String EXPORT_QUEUE = "export.queue";
    public static final String EXPORT_DLQ = "export.dlq";
    public static final String AI_EVALUATION_QUEUE = "ai.evaluation.queue";
    public static final String AI_EVALUATION_DLQ = "ai.evaluation.dlq";

    @Bean
    public Queue extractionQueue() {
        return QueueBuilder.durable(EXTRACTION_QUEUE).build();
    }

    @Bean
    public Queue exportQueue() {
        return QueueBuilder.durable(EXPORT_QUEUE).build();
    }

    @Bean
    public Queue extractionDlq() {
        return QueueBuilder.durable(EXTRACTION_DLQ).build();
    }

    @Bean
    public Queue exportDlq() {
        return QueueBuilder.durable(EXPORT_DLQ).build();
    }

    @Bean
    public Queue aiEvaluationQueue() {
        return QueueBuilder.durable(AI_EVALUATION_QUEUE)
                .withArgument("x-dead-letter-exchange", "")
                .withArgument("x-dead-letter-routing-key", AI_EVALUATION_DLQ)
                .build();
    }

    @Bean
    public Queue aiEvaluationDlq() {
        return QueueBuilder.durable(AI_EVALUATION_DLQ).build();
    }

    @Bean
    public MessageRecoverer failedJobRecoverer(
            RabbitTemplate rabbitTemplate,
            Jackson2JsonMessageConverter messageConverter,
            DocumentPersistenceService documentPersistenceService) {
        return (Message message, Throwable cause) -> {
            String sourceQueue = message.getMessageProperties().getConsumerQueue();
            String deadLetterQueue;
            if (EXTRACTION_QUEUE.equals(sourceQueue)) {
                deadLetterQueue = EXTRACTION_DLQ;
                Object payload = messageConverter.fromMessage(message);
                if (!(payload instanceof ExtractionRequest request)) {
                    throw new AmqpRejectAndDontRequeueException(
                            "Invalid extraction message after retries", cause);
                }
                documentPersistenceService.markFailed(
                        request.documentId(),
                        "Extraction failed after retries; message moved to DLQ");
            } else if (EXPORT_QUEUE.equals(sourceQueue)) {
                deadLetterQueue = EXPORT_DLQ;
            } else {
                throw new AmqpRejectAndDontRequeueException(
                        "Retries exhausted for queue " + sourceQueue, cause);
            }
            message.getMessageProperties().setHeader("x-original-queue", sourceQueue);
            rabbitTemplate.send("", deadLetterQueue, message);
        };
    }

    @Bean
    public Jackson2JsonMessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }
}
