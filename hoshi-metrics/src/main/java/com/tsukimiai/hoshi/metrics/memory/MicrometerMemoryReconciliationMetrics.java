package com.tsukimiai.hoshi.metrics.memory;

import java.time.Duration;

import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.conversation.application.MemoryReconciliationMetrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;

public class MicrometerMemoryReconciliationMetrics implements MemoryReconciliationMetrics {

    private final MeterRegistry meterRegistry;
    private final DistributionSummary scanCandidatesSummary;
    private final DistributionSummary operationsAppliedSummary;

    public MicrometerMemoryReconciliationMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.scanCandidatesSummary = DistributionSummary.builder("hoshi.memory.reconciliation.scan.candidates")
                .description("Number of candidate users scanned for memory reconciliation")
                .baseUnit("users")
                .register(meterRegistry);
        this.operationsAppliedSummary = DistributionSummary.builder("hoshi.memory.reconciliation.operations.applied")
                .description("Number of memory reconciliation operations applied")
                .baseUnit("operations")
                .register(meterRegistry);
    }

    @Override
    public void recordScan(int candidateUsers) {
        scanCandidatesSummary.record(Math.max(candidateUsers, 0));
    }

    @Override
    public void recordScanDuration(String outcome, long durationNanos) {
        Timer.builder("hoshi.memory.reconciliation.scan.duration")
                .description("Duration of memory reconciliation scans")
                .tag("outcome", sanitize(outcome))
                .register(meterRegistry)
                .record(Duration.ofNanos(Math.max(durationNanos, 0)));
    }

    @Override
    public void recordSkipped(String reason) {
        counter("hoshi.memory.reconciliation.skipped.total", Tags.of("reason", sanitize(reason))).increment();
    }

    @Override
    public void recordCompleted() {
        counter("hoshi.memory.reconciliation.completed.total", Tags.empty()).increment();
    }

    @Override
    public void recordOperationsApplied(int operationsApplied) {
        operationsAppliedSummary.record(Math.max(operationsApplied, 0));
    }

    @Override
    public void recordUserError(String errorType) {
        counter("hoshi.memory.reconciliation.user.errors.total", Tags.of("error_type", sanitize(errorType))).increment();
    }

    private Counter counter(String name, Tags tags) {
        return Counter.builder(name).tags(tags).register(meterRegistry);
    }

    private String sanitize(String value) {
        return StringUtils.hasText(value) ? value.trim() : "unknown";
    }
}
