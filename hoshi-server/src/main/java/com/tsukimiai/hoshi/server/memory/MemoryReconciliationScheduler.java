package com.tsukimiai.hoshi.server.memory;

import java.time.Duration;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.conversation.application.MemoryReconciliationWorkflow;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

@Component
public class MemoryReconciliationScheduler {

    private final MemoryReconciliationWorkflow memoryReconciliationWorkflow;
    private final MeterRegistry meterRegistry;

    public MemoryReconciliationScheduler(
            MemoryReconciliationWorkflow memoryReconciliationWorkflow,
            ObjectProvider<MeterRegistry> meterRegistryProvider) {
        this.memoryReconciliationWorkflow = memoryReconciliationWorkflow;
        this.meterRegistry = meterRegistryProvider.getIfAvailable();
    }

    @Scheduled(fixedDelayString = "${hoshi.memory.reconciliation.scan-interval-ms:86400000}")
    public void scan() {
        long startTime = System.nanoTime();
        try {
            memoryReconciliationWorkflow.scanAllUsers();
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
                "scheduler", "memory_reconciliation",
                "outcome", outcome)
                .increment();
        Timer.builder("hoshi.scheduler.scan.duration")
                .description("Duration of scheduled scans")
                .tag("scheduler", "memory_reconciliation")
                .tag("outcome", outcome)
                .register(meterRegistry)
                .record(Duration.ofNanos(System.nanoTime() - startTime));
    }
}
