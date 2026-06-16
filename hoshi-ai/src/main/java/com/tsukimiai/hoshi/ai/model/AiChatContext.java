package com.tsukimiai.hoshi.ai.model;

import java.util.List;

public record AiChatContext(
        List<AiChatTurn> recentTurns,
        AiSessionSummary sessionSummary,
        List<AiMemoryContext> shortMemories,
        List<AiMemoryContext> longMemories,
        List<AiKnowledgeChunk> knowledgeChunks,
        AiPromptBudget promptBudget) {

    public AiChatContext {
        recentTurns = recentTurns == null ? List.of() : List.copyOf(recentTurns);
        shortMemories = shortMemories == null ? List.of() : List.copyOf(shortMemories);
        longMemories = longMemories == null ? List.of() : List.copyOf(longMemories);
        knowledgeChunks = knowledgeChunks == null ? List.of() : List.copyOf(knowledgeChunks);
    }
}
