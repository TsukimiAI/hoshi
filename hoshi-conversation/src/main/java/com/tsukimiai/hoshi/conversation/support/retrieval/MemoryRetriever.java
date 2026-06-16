package com.tsukimiai.hoshi.conversation.support.retrieval;

import java.util.List;

import com.tsukimiai.hoshi.ai.model.AiMemoryContext;

/**
 * 记忆检索抽象，当前默认实现为词法相似度；后续可替换为 embedding 或混合检索。
 */
public interface MemoryRetriever {

    List<AiMemoryContext> retrieveShort(Long userId, String query, int budgetTokens);

    List<AiMemoryContext> retrieveLong(Long userId, String query, int budgetTokens);
}
