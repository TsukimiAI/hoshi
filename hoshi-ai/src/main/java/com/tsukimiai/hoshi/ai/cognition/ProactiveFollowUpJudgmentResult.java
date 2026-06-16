package com.tsukimiai.hoshi.ai.cognition;

public record ProactiveFollowUpJudgmentResult(
        boolean shouldContinue,
        String mode,
        String reason,
        double confidence,
        boolean naturalEnd) implements AiCognitionPayload {
}
