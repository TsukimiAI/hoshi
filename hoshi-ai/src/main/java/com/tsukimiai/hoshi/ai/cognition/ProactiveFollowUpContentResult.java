package com.tsukimiai.hoshi.ai.cognition;

public record ProactiveFollowUpContentResult(
        String content,
        String emotion,
        double confidence) implements AiCognitionPayload {
}
