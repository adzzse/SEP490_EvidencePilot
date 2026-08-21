package com.evidencepilot.config.infrastructure;

import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    // ponytail: extraction/export queues have no DLQ; add DLQs when failed-job replay is required.
    public static final String EXTRACTION_QUEUE = "extraction.queue";
    public static final String EXPORT_QUEUE = "export.queue";
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
    public Jackson2JsonMessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }
}
