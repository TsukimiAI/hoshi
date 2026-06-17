package com.tsukimiai.hoshi.conversation.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class CognitionBackgroundTaskConfigurationTest {

    @SuppressWarnings("unchecked")
    @Test
    void registersExecutorMetricsAndTaskOutcomeMetrics() throws Exception {
        CognitionBackgroundTaskConfiguration configuration = new CognitionBackgroundTaskConfiguration();
        ObjectProvider<MeterRegistry> provider = mock(ObjectProvider.class);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        when(provider.getIfAvailable()).thenReturn(meterRegistry);

        ThreadPoolTaskExecutor executorBean = configuration.cognitionBackgroundTaskExecutorBean(provider);
        var executor = configuration.cognitionBackgroundTaskExecutor(executorBean, provider);
        CountDownLatch latch = new CountDownLatch(1);

        executor.submit("memory-extraction", latch::countDown);
        assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
        executor.supplyAsync("session-compaction", () -> "ok").get(5, TimeUnit.SECONDS);

        assertThat(meterRegistry.get("hoshi.cognition.executor.active")
                .tag("executor", "cognition")
                .gauge()
                .value()).isGreaterThanOrEqualTo(0.0d);
        assertThat(meterRegistry.get("hoshi.cognition.executor.queue.size")
                .tag("executor", "cognition")
                .gauge()
                .value()).isGreaterThanOrEqualTo(0.0d);
        assertThat(meterRegistry.get("hoshi.cognition.background.tasks.total")
                .tag("task_name", "memory-extraction")
                .tag("outcome", "submitted")
                .counter()
                .count()).isEqualTo(1.0d);
        assertThat(meterRegistry.get("hoshi.cognition.background.tasks.total")
                .tag("task_name", "memory-extraction")
                .tag("outcome", "success")
                .counter()
                .count()).isEqualTo(1.0d);
        assertThat(meterRegistry.get("hoshi.cognition.background.tasks.total")
                .tag("task_name", "session-compaction")
                .tag("outcome", "success")
                .counter()
                .count()).isEqualTo(1.0d);
        assertThat(meterRegistry.get("hoshi.cognition.background.task.duration")
                .tag("task_name", "session-compaction")
                .tag("outcome", "success")
                .timer()
                .count()).isEqualTo(1L);

        executorBean.shutdown();
    }
}
