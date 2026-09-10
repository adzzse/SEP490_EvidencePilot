package com.evidencepilot.config.infrastructure;

import com.evidencepilot.dto.ExtractionRequest;
import com.evidencepilot.service.listener.AiEvaluationListener;
import com.evidencepilot.service.listener.DocumentExtractionListener;
import com.evidencepilot.service.listener.ExportListener;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.retry.MessageRecoverer;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.boot.autoconfigure.amqp.RabbitProperties;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RabbitMQConfigTest {

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void extractionFactoryCapsElasticConcurrency() {
        var properties = new RabbitProperties();
        properties.getListener().getSimple().setConcurrency(2);
        properties.getListener().getSimple().setPrefetch(2);
        properties.getListener().getSimple().getRetry().setEnabled(true);
        var provider = (org.springframework.beans.factory.ObjectProvider) mock(
                org.springframework.beans.factory.ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(
                mock(org.springframework.amqp.rabbit.connection.ConnectionFactory.class));
        var propertiesProvider = (org.springframework.beans.factory.ObjectProvider) mock(
                org.springframework.beans.factory.ObjectProvider.class);
        when(propertiesProvider.getIfAvailable(any())).thenReturn(properties);
        var factory = new RabbitMQConfig().extractionListenerContainerFactory(
                provider,
                new Jackson2JsonMessageConverter(),
                mock(MessageRecoverer.class),
                propertiesProvider,
                3);

        assertThat(ReflectionTestUtils.getField(factory, "concurrentConsumers")).isEqualTo(2);
        assertThat(ReflectionTestUtils.getField(factory, "maxConcurrentConsumers")).isEqualTo(3);
        Object[] adviceChain = (Object[]) ReflectionTestUtils.getField(factory, "adviceChain");
        assertThat(adviceChain).hasSize(1);
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void extractionFactoryAbsentWithoutBroker() {
        var provider = (org.springframework.beans.factory.ObjectProvider) mock(
                org.springframework.beans.factory.ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(null);

        assertThat(new RabbitMQConfig().extractionListenerContainerFactory(
                provider,
                new Jackson2JsonMessageConverter(),
                mock(MessageRecoverer.class),
                mock(org.springframework.beans.factory.ObjectProvider.class),
                3)).isNull();
    }

    @Test
    void extractionListenerUsesDedicatedFactory() throws Exception {
        RabbitListener listener = DocumentExtractionListener.class
                .getMethod("handle", ExtractionRequest.class)
                .getAnnotation(RabbitListener.class);

        assertThat(listener.queues()).containsExactly(RabbitMQConfig.EXTRACTION_QUEUE);
        assertThat(listener.containerFactory()).isEqualTo("extractionListenerContainerFactory");
    }

    @Test
    void exportAndEvaluationListenersStayOnSharedDefaults() {
        var factories = Arrays.stream(new Class<?>[] {ExportListener.class, AiEvaluationListener.class})
                .flatMap(type -> Arrays.stream(type.getDeclaredMethods()))
                .filter(method -> method.isAnnotationPresent(RabbitListener.class))
                .map(method -> method.getAnnotation(RabbitListener.class).containerFactory())
                .toList();

        assertThat(factories).isNotEmpty();
        assertThat(factories).allMatch(String::isBlank);
    }
}
