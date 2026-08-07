package com.tsukimiai.hoshi.skill.knowledge.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveRequest;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveResponse;
import com.tsukimiai.hoshi.skill.knowledge.service.HybridKnowledgeRanker.RankResult;

@Service
public class KnowledgeRetrieveService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeRetrieveService.class);

    private final KnowledgeQueryPlanner queryPlanner;
    private final HybridKnowledgeRanker ranker;

    public KnowledgeRetrieveService(KnowledgeQueryPlanner queryPlanner, HybridKnowledgeRanker ranker) {
        this.queryPlanner = queryPlanner;
        this.ranker = ranker;
    }

    public KnowledgeRetrieveResponse retrieve(KnowledgeRetrieveRequest request) {
        if (request == null || request.userId() == null || request.userId() <= 0 || !StringUtils.hasText(request.query())) {
            return new KnowledgeRetrieveResponse(java.util.List.of());
        }
        String query = request.query().trim();
        int topK = Math.max(1, request.topK());
        int budgetTokens = Math.max(0, request.budgetTokens());
        double minScore = clamp01(request.minScore());

        RetrievalPlan plan = queryPlanner.plan(
                request.userId(),
                query,
                request.contextQueries());
        RankResult result = ranker.rank(request.userId(), plan, query, topK, minScore, budgetTokens);

        log.info(
                "Knowledge retrieve intent={}, lockedDocumentId={}, candidateCount={}, returnedCount={}",
                plan.intent(),
                plan.lockedDocumentId(),
                result.candidateCount(),
                result.chunks().size());

        return new KnowledgeRetrieveResponse(result.chunks());
    }

    private double clamp01(double value) {
        if (Double.isNaN(value)) {
            return 0.0;
        }
        return Math.max(0.0, Math.min(1.0, value));
    }
}
