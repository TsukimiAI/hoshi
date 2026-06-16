package com.tsukimiai.hoshi.ai.cognition;

public record ProactiveOpeningResult(
        String content,
        String emotion,
        Double confidence) implements AiCognitionPayload {
}
