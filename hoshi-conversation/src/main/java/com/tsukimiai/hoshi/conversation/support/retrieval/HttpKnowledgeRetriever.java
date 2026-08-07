package com.tsukimiai.hoshi.conversation.support.retrieval;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.config.HoshiAiRagProperties;
import com.tsukimiai.hoshi.ai.model.AiKnowledgeChunk;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeChunkPayload;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveRequest;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveResponse;

public class HttpKnowledgeRetriever implements KnowledgeRetriever {

    private static final Logger log = LoggerFactory.getLogger(HttpKnowledgeRetriever.class);

    private final KnowledgeSkillClient knowledgeSkillClient;
    private final HoshiAiRagProperties ragProperties;

    public HttpKnowledgeRetriever(KnowledgeSkillClient knowledgeSkillClient, HoshiAiRagProperties ragProperties) {
        this.knowledgeSkillClient = knowledgeSkillClient;
        this.ragProperties = ragProperties;
    }

    @Override
    public List<AiKnowledgeChunk> retrieve(
            Long userId,
            String query,
            List<String> contextQueries,
            int budgetTokens) {
        if (userId == null || !StringUtils.hasText(query) || budgetTokens <= 0) {
            return List.of();
        }
        try {
            KnowledgeRetrieveResponse response = knowledgeSkillClient.retrieve(new KnowledgeRetrieveRequest(
                    userId,
                    query.trim(),
                    Math.max(1, ragProperties.getKnowledgeTopK()),
                    budgetTokens,
                    ragProperties.getKnowledgeMinScore(),
                    sanitizeContextQueries(contextQueries, query)));
            return mapChunks(response);
        } catch (Exception ex) {
            log.warn("Knowledge skill retrieval failed for userId={}: {}", userId, ex.getMessage());
            log.debug("Knowledge skill retrieval failure details", ex);
            return List.of();
        }
    }

    private List<String> sanitizeContextQueries(List<String> contextQueries, String query) {
        if (contextQueries == null || contextQueries.isEmpty()) {
            return List.of();
        }
        String trimmedQuery = query.trim();
        List<String> sanitized = new ArrayList<>();
        for (String contextQuery : contextQueries) {
            if (!StringUtils.hasText(contextQuery)) {
                continue;
            }
            String trimmed = contextQuery.trim();
            if (trimmed.equals(trimmedQuery)) {
                continue;
            }
            sanitized.add(trimmed);
        }
        return sanitized;
    }

    private List<AiKnowledgeChunk> mapChunks(KnowledgeRetrieveResponse response) {
        if (response == null || response.chunks().isEmpty()) {
            return List.of();
        }
        List<AiKnowledgeChunk> mapped = new ArrayList<>();
        for (KnowledgeChunkPayload chunk : response.chunks()) {
            if (chunk == null || !StringUtils.hasText(chunk.content())) {
                continue;
            }
            mapped.add(new AiKnowledgeChunk(
                    chunk.title(),
                    chunk.content().trim(),
                    chunk.source()));
        }
        return mapped;
    }
}
