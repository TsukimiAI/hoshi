package com.tsukimiai.hoshi.metrics.proactive;

import java.time.Duration;

import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.conversation.application.proactive.ProactiveConversationMetrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

public class MicrometerProactiveConversationMetrics implements ProactiveConversationMetrics {

    private final MeterRegistry meterRegistry;
    private final DistributionSummary scanCandidatesSummary;

    public MicrometerProactiveConversationMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.scanCandidatesSummary = DistributionSummary.builder("hoshi.proactive.scan.candidates")
                .description("Number of candidate users scanned for proactive conversations")
                .baseUnit("users")
                .register(meterRegistry);
    }

    @Override
    public void recordScan(int candidateUsers) {
        scanCandidatesSummary.record(Math.max(candidateUsers, 0));
    }

    @Override
    public void recordScanDuration(String outcome, long durationNanos) {
        Timer.builder("hoshi.proactive.scan.duration")
                .description("Duration of proactive conversation scans")
                .tag("outcome", sanitizeTag(outcome))
                .register(meterRegistry)
                .record(Duration.ofNanos(Math.max(durationNanos, 0)));
    }

    @Override
    public void recordTriggered(String sourceType) {
        Counter.builder("hoshi.proactive.triggered.total")
                .description("Total proactive conversations triggered")
                .tag("source_type", sanitizeTag(sourceType))
                .register(meterRegistry)
                .increment();
    }

    @Override
    public void recordSkipped(String reason) {
        Counter.builder("hoshi.proactive.skipped.total")
                .description("Total proactive conversation skips")
                .tag("reason", sanitizeTag(reason))
                .register(meterRegistry)
                .increment();
    }

    @Override
    public void recordUserError(String errorType) {
        Counter.builder("hoshi.proactive.user.errors.total")
                .description("Total proactive conversation user-level errors")
                .tag("error_type", sanitizeTag(errorType))
                .register(meterRegistry)
                .increment();
    }

    private String sanitizeTag(String value) {
        return StringUtils.hasText(value) ? value.trim() : "unknown";
    }
}
