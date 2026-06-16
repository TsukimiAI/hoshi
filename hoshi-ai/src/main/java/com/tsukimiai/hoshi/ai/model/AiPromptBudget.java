package com.tsukimiai.hoshi.ai.model;

public record AiPromptBudget(
        int effectiveInputTokens,
        int workingMemoryTokens,
        int sessionSummaryTokens,
        int shortMemoryTokens,
        int longMemoryTokens,
        int flexTokens) {
}
