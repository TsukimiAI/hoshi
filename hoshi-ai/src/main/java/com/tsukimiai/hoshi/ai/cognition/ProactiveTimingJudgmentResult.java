package com.tsukimiai.hoshi.ai.cognition;

public record ProactiveTimingJudgmentResult(
        boolean shouldTrigger,
        String reason,
        double confidence) implements AiCognitionPayload {
}
