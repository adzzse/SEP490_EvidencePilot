package com.evidencepilot.config.infrastructure;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RabbitMQConfigTest {

    @Test
    void exhaustedJobMessagesAreRepublishedToTheirDlqs() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        var recoverer = new RabbitMQConfig().failedJobRecoverer(rabbitTemplate);

        Message extraction = messageFrom(RabbitMQConfig.EXTRACTION_QUEUE);
        Message export = messageFrom(RabbitMQConfig.EXPORT_QUEUE);

        recoverer.recover(extraction, new IllegalStateException("failed"));
        recoverer.recover(export, new IllegalStateException("failed"));

        verify(rabbitTemplate).send("", RabbitMQConfig.EXTRACTION_DLQ, extraction);
        verify(rabbitTemplate).send("", RabbitMQConfig.EXPORT_DLQ, export);
    }

    @Test
    void exhaustedAiMessageIsRejectedForItsExistingBrokerDlx() {
        var recoverer = new RabbitMQConfig().failedJobRecoverer(mock(RabbitTemplate.class));

        assertThrows(AmqpRejectAndDontRequeueException.class, () -> recoverer.recover(
                messageFrom(RabbitMQConfig.AI_EVALUATION_QUEUE),
                new IllegalStateException("failed")));
    }

    private static Message messageFrom(String queue) {
        MessageProperties properties = new MessageProperties();
        properties.setConsumerQueue(queue);
        return new Message(new byte[] {1}, properties);
    }
}
