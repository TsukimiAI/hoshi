package com.tsukimiai.hoshi.server.proactive;

import java.time.Duration;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.conversation.application.proactive.ProactiveConversationWorkflow;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

@Component
@EnableScheduling
public class ProactiveConversationScheduler {

    private final ProactiveConversationWorkflow proactiveConversationWorkflow;
    private final MeterRegistry meterRegistry;

    public ProactiveConversationScheduler(
            ProactiveConversationWorkflow proactiveConversationWorkflow,
            ObjectProvider<MeterRegistry> meterRegistryProvider) {
        this.proactiveConversationWorkflow = proactiveConversationWorkflow;
        this.meterRegistry = meterRegistryProvider.getIfAvailable();
    }

    @Scheduled(fixedDelayString = "${hoshi.proactive.scan-interval-ms:2700000}")
    public void scan() {
        long startTime = System.nanoTime();
        try {
            proactiveConversationWorkflow.scanAllUsers();
            recordSchedulerRun("success", startTime);
        } catch (RuntimeException ex) {
            recordSchedulerRun("failure", startTime);
            throw ex;
        }
    }

    private void recordSchedulerRun(String outcome, long startTime) {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter(
                "hoshi.scheduler.scan.runs.total",
                "scheduler", "proactive_conversation",
                "outcome", outcome)
                .increment();
        Timer.builder("hoshi.scheduler.scan.duration")
                .description("Duration of scheduled scans")
                .tag("scheduler", "proactive_conversation")
                .tag("outcome", outcome)
                .register(meterRegistry)
                .record(Duration.ofNanos(System.nanoTime() - startTime));
    }
}
