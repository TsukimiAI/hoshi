package com.tsukimiai.hoshi.conversation.application;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.config.HoshiAiRagProperties;
import com.tsukimiai.hoshi.ai.model.AiKnowledgeChunk;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.ai.model.AiPromptBudget;
import com.tsukimiai.hoshi.conversation.config.KnowledgeSkillProperties;
import com.tsukimiai.hoshi.conversation.support.retrieval.KnowledgeRetriever;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeQueryIntentRules;

@Service
public class RetrievalOrchestrator {

    private final MemoryExtractionWorkflow memoryExtractionWorkflow;
    private final KnowledgeRetriever knowledgeRetriever;
    private final HoshiAiRagProperties ragProperties;
    private final KnowledgeSkillProperties skillProperties;
    private final RetrievalMetrics metrics;

    public RetrievalOrchestrator(
            MemoryExtractionWorkflow memoryExtractionWorkflow,
            KnowledgeRetriever knowledgeRetriever,
            HoshiAiRagProperties ragProperties,
            KnowledgeSkillProperties skillProperties,
            RetrievalMetrics metrics) {
        this.memoryExtractionWorkflow = memoryExtractionWorkflow;
        this.knowledgeRetriever = knowledgeRetriever;
        this.ragProperties = ragProperties;
        this.skillProperties = skillProperties;
        this.metrics = metrics;
    }

    public RetrievalBundle retrieve(
            Long userId,
            String query,
            List<String> contextQueries,
            AiPromptBudget promptBudget) {
        List<AiMemoryContext> shortMemories = memoryExtractionWorkflow.selectShortMemories(
                userId, query, promptBudget.shortMemoryTokens());
        List<AiMemoryContext> longMemories = memoryExtractionWorkflow.selectLongMemories(
                userId, query, promptBudget.longMemoryTokens());
        List<AiKnowledgeChunk> knowledgeChunks = retrieveKnowledge(userId, query, contextQueries, promptBudget);
        return new RetrievalBundle(shortMemories, longMemories, knowledgeChunks);
    }

    public RetrievalBundle retrieve(Long userId, String query, AiPromptBudget promptBudget) {
        return retrieve(userId, query, List.of(), promptBudget);
    }

    private List<AiKnowledgeChunk> retrieveKnowledge(
            Long userId,
            String query,
            List<String> contextQueries,
            AiPromptBudget promptBudget) {
        if (!isKnowledgeEnabled()) {
            metrics.recordSkipped("disabled");
            return List.of();
        }
        if (!StringUtils.hasText(query)) {
            metrics.recordSkipped("empty_query");
            return List.of();
        }
        int budgetTokens = resolveKnowledgeBudget(promptBudget, query);
        if (budgetTokens <= 0) {
            metrics.recordSkipped("zero_budget");
            return List.of();
        }

        long startTime = System.nanoTime();
        try {
            List<AiKnowledgeChunk> chunks = knowledgeRetriever.retrieve(
                    userId,
                    query.trim(),
                    contextQueries == null ? List.of() : contextQueries,
                    budgetTokens);
            metrics.recordKnowledgeHits(chunks.size());
            return chunks;
        } catch (Exception ex) {
            metrics.recordSkipped("retrieval_error");
            return List.of();
        } finally {
            metrics.recordRetrievalDuration(System.nanoTime() - startTime);
        }
    }

    private int resolveKnowledgeBudget(AiPromptBudget promptBudget, String query) {
        if (KnowledgeQueryIntentRules.isSummaryLikeQuery(query)) {
            int summaryBudget = ragProperties.getKnowledgeSummaryBudgetTokens();
            if (summaryBudget > 0) {
                return summaryBudget;
            }
        }
        int configured = ragProperties.getKnowledgeBudgetTokens();
        if (configured > 0) {
            return configured;
        }
        return promptBudget.flexTokens();
    }

    private boolean isKnowledgeEnabled() {
        return ragProperties.isKnowledgeRetrievalActive() || skillProperties.isEnabled();
    }
}
