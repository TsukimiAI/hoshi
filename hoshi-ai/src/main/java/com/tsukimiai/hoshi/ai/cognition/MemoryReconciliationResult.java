package com.tsukimiai.hoshi.ai.cognition;

import java.util.List;

public record MemoryReconciliationResult(
        List<MemoryReconciliationOperation> operations) implements AiCognitionPayload {

    public MemoryReconciliationResult {
        operations = operations == null ? List.of() : List.copyOf(operations);
    }
}
