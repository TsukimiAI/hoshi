package com.tsukimiai.hoshi.ai.metrics;

import java.util.StringJoiner;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.util.StringUtils;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;

public final class AiTokenMetricsRecorder {

    private final MeterRegistry meterRegistry;
    private final ConcurrentHashMap<String, Meters> cache = new ConcurrentHashMap<>();

    public AiTokenMetricsRecorder(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void recordChat(
            AiTokenUsageExtractor.AiTokenUsage tokenUsage,
            String operation,
            boolean webSearch,
            String model,
            String outcome) {
        record(tokenUsage, operation, "none", model, outcome, Tags.of("web_search", Boolean.toString(webSearch)));
    }

    public void recordCognition(
            AiTokenUsageExtractor.AiTokenUsage tokenUsage,
            String operation,
            String taskType,
            String model,
            String outcome) {
        record(tokenUsage, operation, taskType, model, outcome, Tags.empty());
    }

    private void record(
            AiTokenUsageExtractor.AiTokenUsage tokenUsage,
            String operation,
            String taskType,
            String model,
            String outcome,
            Tags extraTags) {
        if (meterRegistry == null || tokenUsage == null) {
            return;
        }
        String sourceValue = sanitize(tokenUsage.source());
        String operationValue = sanitize(operation);
        String taskTypeValue = sanitize(taskType);
        String modelValue = sanitize(model);
        String outcomeValue = sanitize(outcome);

        Tags tags = Tags.of(
                        "source", sourceValue,
                        "operation", operationValue,
                        "task_type", taskTypeValue,
                        "model", modelValue,
                        "outcome", outcomeValue)
                .and(extraTags == null ? Tags.empty() : extraTags);

        double prompt = Math.max(tokenUsage.promptTokens(), 0);
        double completion = Math.max(tokenUsage.completionTokens(), 0);
        double total = Math.max(tokenUsage.totalTokens(), 0);

        Meters meters = cache.computeIfAbsent(cacheKey(tags), key -> new Meters(meterRegistry, tags));
        meters.requestsCounter.increment();
        meters.promptCounter.increment(prompt);
        meters.completionCounter.increment(completion);
        meters.totalCounter.increment(total);

        meters.promptPerRequest.record(prompt);
        meters.completionPerRequest.record(completion);
        meters.totalPerRequest.record(total);
    }

    private static String cacheKey(Tags tags) {
        StringJoiner joiner = new StringJoiner("|", "ai_tokens:", "");
        for (var tag : tags) {
            joiner.add(tag.getKey()).add(tag.getValue());
        }
        return joiner.toString();
    }

    private static String sanitize(String value) {
        return StringUtils.hasText(value) ? value.trim() : "unknown";
    }

    private static final class Meters {
        final Counter requestsCounter;
        final Counter promptCounter;
        final Counter completionCounter;
        final Counter totalCounter;
        final DistributionSummary promptPerRequest;
        final DistributionSummary completionPerRequest;
        final DistributionSummary totalPerRequest;

        Meters(MeterRegistry meterRegistry, Tags tags) {
            this.requestsCounter = Counter.builder("hoshi.ai.tokens.requests.total")
                    .description("AI requests with token usage recorded (use source tag for actual vs estimated ratio)")
                    .tags(tags)
                    .register(meterRegistry);
            this.promptCounter = Counter.builder("hoshi.ai.tokens.prompt")
                    .description("Prompt tokens consumed")
                    .tags(tags)
                    .register(meterRegistry);
            this.completionCounter = Counter.builder("hoshi.ai.tokens.completion")
                    .description("Completion tokens consumed")
                    .tags(tags)
                    .register(meterRegistry);
            this.totalCounter = Counter.builder("hoshi.ai.tokens.total")
                    .description("Total tokens consumed")
                    .tags(tags)
                    .register(meterRegistry);

            this.promptPerRequest = DistributionSummary.builder("hoshi.ai.tokens.prompt.request")
                    .description("Prompt tokens per request")
                    .baseUnit("tokens")
                    .tags(tags)
                    .register(meterRegistry);
            this.completionPerRequest = DistributionSummary.builder("hoshi.ai.tokens.completion.request")
                    .description("Completion tokens per request")
                    .baseUnit("tokens")
                    .tags(tags)
                    .register(meterRegistry);
            this.totalPerRequest = DistributionSummary.builder("hoshi.ai.tokens.total.request")
                    .description("Total tokens per request")
                    .baseUnit("tokens")
                    .tags(tags)
                    .register(meterRegistry);
        }
    }
}

