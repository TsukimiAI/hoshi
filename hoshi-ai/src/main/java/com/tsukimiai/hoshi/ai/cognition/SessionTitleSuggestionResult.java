package com.tsukimiai.hoshi.ai.cognition;

public record SessionTitleSuggestionResult(
        String title,
        Double confidence) implements AiCognitionPayload {
}
