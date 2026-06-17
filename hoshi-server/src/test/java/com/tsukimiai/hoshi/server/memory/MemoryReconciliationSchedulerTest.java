package com.tsukimiai.hoshi.server.memory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import com.tsukimiai.hoshi.conversation.application.MemoryReconciliationWorkflow;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class MemoryReconciliationSchedulerTest {

    @SuppressWarnings("unchecked")
    @Test
    void scanRecordsSuccessMetrics() {
        MemoryReconciliationWorkflow workflow = mock(MemoryReconciliationWorkflow.class);
        ObjectProvider provider = mock(ObjectProvider.class);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        org.mockito.Mockito.when(provider.getIfAvailable()).thenReturn(meterRegistry);
        MemoryReconciliationScheduler scheduler = new MemoryReconciliationScheduler(workflow, provider);

        scheduler.scan();

        assertThat(meterRegistry.get("hoshi.scheduler.scan.runs.total")
                .tag("scheduler", "memory_reconciliation")
                .tag("outcome", "success")
                .counter()
                .count()).isEqualTo(1.0d);
    }

    @SuppressWarnings("unchecked")
    @Test
    void scanRecordsFailureMetrics() {
        MemoryReconciliationWorkflow workflow = mock(MemoryReconciliationWorkflow.class);
        doThrow(new RuntimeException("boom")).when(workflow).scanAllUsers();
        ObjectProvider provider = mock(ObjectProvider.class);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        org.mockito.Mockito.when(provider.getIfAvailable()).thenReturn(meterRegistry);
        MemoryReconciliationScheduler scheduler = new MemoryReconciliationScheduler(workflow, provider);

        assertThatThrownBy(scheduler::scan).isInstanceOf(RuntimeException.class);
        assertThat(meterRegistry.get("hoshi.scheduler.scan.runs.total")
                .tag("scheduler", "memory_reconciliation")
                .tag("outcome", "failure")
                .counter()
                .count()).isEqualTo(1.0d);
    }
}
