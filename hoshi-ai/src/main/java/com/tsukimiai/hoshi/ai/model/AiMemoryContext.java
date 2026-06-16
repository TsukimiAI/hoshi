package com.tsukimiai.hoshi.ai.model;

public record AiMemoryContext(
        String id,
        String content,
        String memoryType,
        String category,
        String temporalScope,
        Double confidence,
        Double importance,
        Double retentionScore,
        boolean alwaysPinned) {
}
