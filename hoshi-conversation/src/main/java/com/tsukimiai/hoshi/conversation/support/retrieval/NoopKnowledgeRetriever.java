package com.tsukimiai.hoshi.conversation.support.retrieval;

import java.util.List;

import com.tsukimiai.hoshi.ai.model.AiKnowledgeChunk;

public class NoopKnowledgeRetriever implements KnowledgeRetriever {

    @Override
    public List<AiKnowledgeChunk> retrieve(
            Long userId,
            String query,
            List<String> contextQueries,
            int budgetTokens) {
        return List.of();
    }
}
