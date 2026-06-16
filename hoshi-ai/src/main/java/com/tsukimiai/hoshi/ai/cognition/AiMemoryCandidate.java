package com.tsukimiai.hoshi.ai.cognition;

public record AiMemoryCandidate(
        String content,
        String memoryType,
        String category,
        String temporalScope,
        String action,
        String supersedesContent,
        Long supersedesMemoryId,
        Double confidence,
        Double importance,
        String reason,
        AiMemoryEvidence evidence) {

    public String normalizedAction() {
        if (action == null || action.isBlank()) {
            return "create";
        }
        return action.trim().toLowerCase();
    }
}
