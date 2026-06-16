package com.tsukimiai.hoshi.ai.cognition;

public record EmotionClassificationResult(
        String emotion,
        Double confidence) implements AiCognitionPayload {
}
