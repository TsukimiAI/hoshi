package com.tsukimiai.hoshi.server.proactive;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import com.tsukimiai.hoshi.conversation.application.proactive.ProactiveConversationWorkflow;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class ProactiveConversationSchedulerTest {

    @SuppressWarnings("unchecked")
    @Test
    void scanRecordsSuccessMetrics() {
        ProactiveConversationWorkflow workflow = mock(ProactiveConversationWorkflow.class);
        ObjectProvider provider = mock(ObjectProvider.class);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        org.mockito.Mockito.when(provider.getIfAvailable()).thenReturn(meterRegistry);
        ProactiveConversationScheduler scheduler = new ProactiveConversationScheduler(workflow, provider);

        scheduler.scan();

        assertThat(meterRegistry.get("hoshi.scheduler.scan.runs.total")
                .tag("scheduler", "proactive_conversation")
                .tag("outcome", "success")
                .counter()
                .count()).isEqualTo(1.0d);
    }

    @SuppressWarnings("unchecked")
    @Test
    void scanRecordsFailureMetrics() {
        ProactiveConversationWorkflow workflow = mock(ProactiveConversationWorkflow.class);
        doThrow(new RuntimeException("boom")).when(workflow).scanAllUsers();
        ObjectProvider provider = mock(ObjectProvider.class);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        org.mockito.Mockito.when(provider.getIfAvailable()).thenReturn(meterRegistry);
        ProactiveConversationScheduler scheduler = new ProactiveConversationScheduler(workflow, provider);

        assertThatThrownBy(scheduler::scan).isInstanceOf(RuntimeException.class);
        assertThat(meterRegistry.get("hoshi.scheduler.scan.runs.total")
                .tag("scheduler", "proactive_conversation")
                .tag("outcome", "failure")
                .counter()
                .count()).isEqualTo(1.0d);
    }
}
