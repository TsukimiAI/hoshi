package com.tsukimiai.hoshi.ai.cognition;

import java.util.List;

public record MemoryExtractionResult(
        List<AiMemoryCandidate> memories) implements AiCognitionPayload {

    public MemoryExtractionResult {
        memories = memories == null ? List.of() : List.copyOf(memories);
    }
}
