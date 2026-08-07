package com.tsukimiai.hoshi.skill.api.knowledge;

import java.util.List;

public record KnowledgeRetrieveRequest(
        Long userId,
        String query,
        int topK,
        int budgetTokens,
        double minScore,
        List<String> contextQueries) {

    public KnowledgeRetrieveRequest(Long userId, String query, int topK, int budgetTokens, double minScore) {
        this(userId, query, topK, budgetTokens, minScore, List.of());
    }

    public KnowledgeRetrieveRequest {
        if (contextQueries == null) {
            contextQueries = List.of();
        }
    }
}
