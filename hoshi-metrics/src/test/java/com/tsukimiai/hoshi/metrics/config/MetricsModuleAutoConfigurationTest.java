package com.tsukimiai.hoshi.metrics.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.tsukimiai.hoshi.companion.metrics.CompanionWebSocketMetrics;
import com.tsukimiai.hoshi.conversation.application.MemoryReconciliationMetrics;
import com.tsukimiai.hoshi.conversation.application.proactive.ProactiveConversationMetrics;
import com.tsukimiai.hoshi.metrics.companion.MicrometerCompanionWebSocketMetrics;
import com.tsukimiai.hoshi.metrics.memory.MicrometerMemoryReconciliationMetrics;
import com.tsukimiai.hoshi.metrics.proactive.MicrometerProactiveConversationMetrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;

class MetricsModuleAutoConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(MetricsModuleAutoConfiguration.class))
            .withBean(MeterRegistry.class, () -> new PrometheusMeterRegistry(PrometheusConfig.DEFAULT))
            .withPropertyValues("spring.application.name=hoshi-server");

    @Test
    void registersMetricsBeans() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(ProactiveConversationMetrics.class);
            assertThat(context).hasSingleBean(MemoryReconciliationMetrics.class);
            assertThat(context).hasSingleBean(CompanionWebSocketMetrics.class);
            assertThat(context.getBean(ProactiveConversationMetrics.class))
                    .isInstanceOf(MicrometerProactiveConversationMetrics.class);
            assertThat(context.getBean(MemoryReconciliationMetrics.class))
                    .isInstanceOf(MicrometerMemoryReconciliationMetrics.class);
            assertThat(context.getBean(CompanionWebSocketMetrics.class))
                    .isInstanceOf(MicrometerCompanionWebSocketMetrics.class);
        });
    }

    @Test
    void commonTagsAndProactiveMetricsAreRecorded() {
        contextRunner.run(context -> {
            MeterRegistry registry = context.getBean(MeterRegistry.class);
            ProactiveConversationMetrics metrics = context.getBean(ProactiveConversationMetrics.class);
            MemoryReconciliationMetrics memoryMetrics = context.getBean(MemoryReconciliationMetrics.class);
            CompanionWebSocketMetrics companionMetrics = context.getBean(CompanionWebSocketMetrics.class);

            registry.counter("hoshi.test.counter").increment();
            metrics.recordScan(3);
            metrics.recordScanDuration("success", 1_000_000L);
            metrics.recordTriggered("memory");
            metrics.recordSkipped("disabled");
            metrics.recordUserError("unexpected");
            memoryMetrics.recordScan(2);
            memoryMetrics.recordScanDuration("success", 2_000_000L);
            memoryMetrics.recordCompleted();
            memoryMetrics.recordOperationsApplied(4);
            memoryMetrics.recordSkipped("no_sessions");
            memoryMetrics.recordUserError("unexpected");
            companionMetrics.recordActiveConnections(2);
            companionMetrics.recordConnectionOpened("pet");
            companionMetrics.recordConnectionClosed("pet", "normal");
            companionMetrics.recordTransportError("pet");
            companionMetrics.recordEventPublished("emotion", "chat");
            companionMetrics.recordMessageSent("emotion");
            companionMetrics.recordMessageSendError("io_error");

            Counter counter = registry.get("hoshi.test.counter").counter();
            DistributionSummary summary = registry.get("hoshi.proactive.scan.candidates").summary();
            Counter triggered = registry.get("hoshi.proactive.triggered.total")
                    .tag("source_type", "memory")
                    .counter();
            Counter skipped = registry.get("hoshi.proactive.skipped.total")
                    .tag("reason", "disabled")
                    .counter();
            Counter proactiveUserErrors = registry.get("hoshi.proactive.user.errors.total")
                    .tag("error_type", "unexpected")
                    .counter();
            DistributionSummary memoryScan = registry.get("hoshi.memory.reconciliation.scan.candidates").summary();
            DistributionSummary operationsApplied = registry.get("hoshi.memory.reconciliation.operations.applied").summary();
            Counter memorySkipped = registry.get("hoshi.memory.reconciliation.skipped.total")
                    .tag("reason", "no_sessions")
                    .counter();
            Counter memoryCompleted = registry.get("hoshi.memory.reconciliation.completed.total").counter();
            Counter companionSent = registry.get("hoshi.companion.ws.messages.sent.total")
                    .tag("event_type", "emotion")
                    .counter();

            assertThat(counter.getId().getTag("application")).isEqualTo("hoshi-server");
            assertThat(summary.count()).isEqualTo(1);
            assertThat(summary.totalAmount()).isEqualTo(3.0d);
            assertThat(triggered.count()).isEqualTo(1.0d);
            assertThat(skipped.count()).isEqualTo(1.0d);
            assertThat(proactiveUserErrors.count()).isEqualTo(1.0d);
            assertThat(memoryScan.totalAmount()).isEqualTo(2.0d);
            assertThat(operationsApplied.totalAmount()).isEqualTo(4.0d);
            assertThat(memorySkipped.count()).isEqualTo(1.0d);
            assertThat(memoryCompleted.count()).isEqualTo(1.0d);
            assertThat(companionSent.count()).isEqualTo(1.0d);
            assertThat(registry.get("hoshi.companion.ws.connections.active").gauge().value()).isEqualTo(2.0d);
        });
    }
}
