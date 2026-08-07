package com.tsukimiai.hoshi.metrics.retrieval;

import java.time.Duration;

import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.conversation.application.RetrievalMetrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;

public class MicrometerRetrievalMetrics implements RetrievalMetrics {

    private final MeterRegistry meterRegistry;
    private final DistributionSummary knowledgeHitsSummary;

    public MicrometerRetrievalMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.knowledgeHitsSummary = DistributionSummary.builder("hoshi.retrieval.knowledge.hits")
                .description("Number of knowledge chunks returned by retrieval")
                .baseUnit("chunks")
                .register(meterRegistry);
    }

    @Override
    public void recordSkipped(String reason) {
        counter("hoshi.retrieval.skipped.total", Tags.of("reason", sanitize(reason))).increment();
    }

    @Override
    public void recordKnowledgeHits(int hitCount) {
        knowledgeHitsSummary.record(Math.max(hitCount, 0));
    }

    @Override
    public void recordRetrievalDuration(long durationNanos) {
        Timer.builder("hoshi.retrieval.duration")
                .description("Duration of unified retrieval orchestration")
                .register(meterRegistry)
                .record(Duration.ofNanos(Math.max(durationNanos, 0)));
    }

    private Counter counter(String name, Tags tags) {
        return Counter.builder(name).tags(tags).register(meterRegistry);
    }

    private String sanitize(String value) {
        return StringUtils.hasText(value) ? value.trim() : "unknown";
    }
}
