package com.tsukimiai.hoshi.ai.cognition;

public record MemoryReconciliationOperation(
        String action,
        Long targetMemoryId,
        String targetContent,
        String newContent,
        String memoryType,
        String category,
        String reason,
        Double confidence) implements AiCognitionPayload {
}
