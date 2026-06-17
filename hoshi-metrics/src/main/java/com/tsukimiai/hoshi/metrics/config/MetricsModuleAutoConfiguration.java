package com.tsukimiai.hoshi.metrics.config;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;

import com.tsukimiai.hoshi.companion.metrics.CompanionWebSocketMetrics;
import com.tsukimiai.hoshi.conversation.application.MemoryReconciliationMetrics;
import com.tsukimiai.hoshi.conversation.application.proactive.ProactiveConversationMetrics;
import com.tsukimiai.hoshi.metrics.companion.MicrometerCompanionWebSocketMetrics;
import com.tsukimiai.hoshi.metrics.memory.MicrometerMemoryReconciliationMetrics;
import com.tsukimiai.hoshi.metrics.proactive.MicrometerProactiveConversationMetrics;

import io.micrometer.core.instrument.MeterRegistry;

@AutoConfiguration
public class MetricsModuleAutoConfiguration {

    @Bean
    static BeanPostProcessor hoshiMeterRegistryPostProcessor(Environment environment) {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (bean instanceof MeterRegistry registry) {
                    registry.config()
                            .commonTags("application", environment.getProperty("spring.application.name", "hoshi"));
                }
                return bean;
            }
        };
    }

    @Bean
    @Primary
    ProactiveConversationMetrics micrometerProactiveConversationMetrics(MeterRegistry meterRegistry) {
        return new MicrometerProactiveConversationMetrics(meterRegistry);
    }

    @Bean
    @Primary
    MemoryReconciliationMetrics micrometerMemoryReconciliationMetrics(MeterRegistry meterRegistry) {
        return new MicrometerMemoryReconciliationMetrics(meterRegistry);
    }

    @Bean
    @Primary
    CompanionWebSocketMetrics micrometerCompanionWebSocketMetrics(MeterRegistry meterRegistry) {
        return new MicrometerCompanionWebSocketMetrics(meterRegistry);
    }
}
