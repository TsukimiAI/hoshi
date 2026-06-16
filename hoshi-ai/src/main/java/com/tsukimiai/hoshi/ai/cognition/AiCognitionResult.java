package com.tsukimiai.hoshi.ai.cognition;

import java.util.List;

public record AiCognitionResult(
        String taskId,
        AiCognitionTaskType taskType,
        AiCognitionStatus status,
        String model,
        AiCognitionPayload result,
        List<String> warnings,
        String rawText) {

    public AiCognitionResult {
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
