package com.tsukimiai.hoshi.conversation.support.retrieval;

import java.util.List;

import com.tsukimiai.hoshi.ai.model.AiKnowledgeChunk;

/**
 * Knowledge retrieval abstraction. Default implementation is a no-op placeholder;
 * knowledge-base Skill adapters can replace or supplement this SPI later.
 */
public interface KnowledgeRetriever {

    List<AiKnowledgeChunk> retrieve(Long userId, String query, List<String> contextQueries, int budgetTokens);
}
