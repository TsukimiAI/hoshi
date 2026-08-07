package com.tsukimiai.hoshi.conversation.application;

import java.util.List;

import com.tsukimiai.hoshi.ai.model.AiKnowledgeChunk;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;

public record RetrievalBundle(
        List<AiMemoryContext> shortMemories,
        List<AiMemoryContext> longMemories,
        List<AiKnowledgeChunk> knowledgeChunks) {

    public RetrievalBundle {
        shortMemories = shortMemories == null ? List.of() : List.copyOf(shortMemories);
        longMemories = longMemories == null ? List.of() : List.copyOf(longMemories);
        knowledgeChunks = knowledgeChunks == null ? List.of() : List.copyOf(knowledgeChunks);
    }
}
