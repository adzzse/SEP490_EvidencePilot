package com.evidencepilot.config.infrastructure;

import com.evidencepilot.dto.ExtractionRequest;
import com.evidencepilot.service.impl.DocumentPersistenceService;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RabbitMQConfigTest {

    @Test
    void exhaustedJobMessagesAreRepublishedToTheirDlqs() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        DocumentPersistenceService persistence = mock(DocumentPersistenceService.class);
        Jackson2JsonMessageConverter converter = new Jackson2JsonMessageConverter();
        var recoverer = new RabbitMQConfig().failedJobRecoverer(
                rabbitTemplate, converter, persistence);
        UUID documentId = UUID.randomUUID();

        Message extraction = converter.toMessage(
                new ExtractionRequest(documentId),
                propertiesFrom(RabbitMQConfig.EXTRACTION_QUEUE));
        Message export = messageFrom(RabbitMQConfig.EXPORT_QUEUE);

        recoverer.recover(extraction, new IllegalStateException("failed"));
        recoverer.recover(export, new IllegalStateException("failed"));

        verify(persistence).markFailed(
                documentId,
                "Extraction failed after retries; message moved to DLQ");
        verify(rabbitTemplate).send("", RabbitMQConfig.EXTRACTION_DLQ, extraction);
        verify(rabbitTemplate).send("", RabbitMQConfig.EXPORT_DLQ, export);
    }

    @Test
    void exhaustedAiMessageIsRejectedForItsExistingBrokerDlx() {
        var recoverer = new RabbitMQConfig().failedJobRecoverer(
                mock(RabbitTemplate.class),
                new Jackson2JsonMessageConverter(),
                mock(DocumentPersistenceService.class));

        assertThrows(AmqpRejectAndDontRequeueException.class, () -> recoverer.recover(
                messageFrom(RabbitMQConfig.AI_EVALUATION_QUEUE),
                new IllegalStateException("failed")));
    }

    private static Message messageFrom(String queue) {
        return new Message(new byte[] {1}, propertiesFrom(queue));
    }

    private static MessageProperties propertiesFrom(String queue) {
        MessageProperties properties = new MessageProperties();
        properties.setConsumerQueue(queue);
        return properties;
    }
}
