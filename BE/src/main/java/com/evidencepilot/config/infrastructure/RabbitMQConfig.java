package com.evidencepilot.config.infrastructure;

import com.evidencepilot.dto.ExtractionRequest;
import com.evidencepilot.service.impl.DocumentPersistenceService;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.retry.MessageRecoverer;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.amqp.RabbitProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RabbitMQConfig.class);

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

    /**
     * Dedicated factory for the extraction queue: multi-minute MinerU jobs get
     * parallel consumers (elastic up to max), while export/evaluation listeners
     * stay on the boot default factory. Retry/backoff/recoverer mirror the
     * {@code spring.rabbitmq.listener.simple} properties, so DLQ semantics are
     * identical — only the concurrency envelope differs.
     *
     * <p>Resolves the {@code ConnectionFactory} lazily via provider: broker-less
     * contexts (tests with RabbitAutoConfiguration excluded) get no factory and
     * start exactly as before, since listener endpoints stay dormant there.
     * A plain {@code @ConditionalOnBean} cannot be used — user configuration is
     * evaluated before auto-configuration provides the connection factory.
     */
    @Bean
    public SimpleRabbitListenerContainerFactory extractionListenerContainerFactory(
            ObjectProvider<ConnectionFactory> connectionFactory,
            Jackson2JsonMessageConverter messageConverter,
            MessageRecoverer failedJobRecoverer,
            ObjectProvider<RabbitProperties> propertiesProvider,
            @Value("${RABBITMQ_EXTRACTION_MAX_CONCURRENCY:3}") int maxConcurrentConsumers) {
        ConnectionFactory resolved = connectionFactory.getIfAvailable();
        if (resolved == null) {
            return null;
        }
        // RabbitProperties rides with RabbitAutoConfiguration; fall back to
        // Boot defaults when it is absent (same broker-less test story).
        RabbitProperties properties = propertiesProvider.getIfAvailable(RabbitProperties::new);
        var simple = properties.getListener().getSimple();
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(resolved);
        factory.setMessageConverter(messageConverter);
        if (simple.getConcurrency() != null) factory.setConcurrentConsumers(simple.getConcurrency());
        if (simple.getPrefetch() != null) factory.setPrefetchCount(simple.getPrefetch());
        if (simple.getDefaultRequeueRejected() != null) {
            factory.setDefaultRequeueRejected(simple.getDefaultRequeueRejected());
        }
        factory.setMaxConcurrentConsumers(Math.max(1, maxConcurrentConsumers));
        log.info("Extraction listener concurrency: consumers={}, prefetch={}, max={}, retry={}",
                simple.getConcurrency(), simple.getPrefetch(),
                maxConcurrentConsumers, simple.getRetry().isEnabled());
        if (simple.getRetry().isEnabled()) {
            var retry = simple.getRetry();
            factory.setAdviceChain(RetryInterceptorBuilder.stateless()
                    .backOffOptions(
                            retry.getInitialInterval().toMillis(),
                            retry.getMultiplier(),
                            retry.getMaxInterval().toMillis())
                    .maxAttempts(retry.getMaxAttempts())
                    .recoverer(failedJobRecoverer)
                    .build());
        }
        return factory;
    }
}
