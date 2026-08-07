package com.tsukimiai.hoshi.conversation.support.retrieval;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.config.HoshiAiRagProperties;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;

public class HybridMemoryRetriever implements MemoryRetriever {

    private final MemoryRetriever lexicalMemoryRetriever;
    private final VectorMemoryRetriever vectorMemoryRetriever;
    private final HoshiAiRagProperties ragProperties;
    private final HoshiAiProperties hoshiAiProperties;

    public HybridMemoryRetriever(
            MemoryRetriever lexicalMemoryRetriever,
            VectorMemoryRetriever vectorMemoryRetriever,
            HoshiAiRagProperties ragProperties,
            HoshiAiProperties hoshiAiProperties) {
        this.lexicalMemoryRetriever = lexicalMemoryRetriever;
        this.vectorMemoryRetriever = vectorMemoryRetriever;
        this.ragProperties = ragProperties;
        this.hoshiAiProperties = hoshiAiProperties;
    }

    @Override
    public List<AiMemoryContext> retrieveShort(Long userId, String query, int budgetTokens) {
        return lexicalMemoryRetriever.retrieveShort(userId, query, budgetTokens);
    }

    @Override
    public List<AiMemoryContext> retrieveLong(Long userId, String query, int budgetTokens) {
        List<AiMemoryContext> lexical = lexicalMemoryRetriever.retrieveLong(userId, query, budgetTokens);
        if (!ragProperties.isMemoryRetrievalActive() || !StringUtils.hasText(query) || budgetTokens <= 0) {
            return lexical;
        }

        List<AiMemoryContext> vector = vectorMemoryRetriever.retrieveLong(userId, query, budgetTokens);
        if (vector.isEmpty()) {
            return lexical;
        }

        int maxCount = hoshiAiProperties.getLongMemoryAlwaysPinnedLimit() + hoshiAiProperties.getQueryRelevantLongMemoryLimit();
        List<AiMemoryContext> merged = new ArrayList<>();
        Set<String> usedIds = new HashSet<>();

        for (AiMemoryContext item : lexical) {
            if (item == null || !StringUtils.hasText(item.id())) {
                continue;
            }
            merged.add(item);
            usedIds.add(item.id());
            if (merged.size() >= maxCount) {
                return trim(merged, budgetTokens, maxCount);
            }
        }

        for (AiMemoryContext item : vector) {
            if (item == null || !StringUtils.hasText(item.id()) || usedIds.contains(item.id())) {
                continue;
            }
            merged.add(item);
            usedIds.add(item.id());
            if (merged.size() >= maxCount) {
                break;
            }
        }
        return trim(merged, budgetTokens, maxCount);
    }

    private List<AiMemoryContext> trim(List<AiMemoryContext> memories, int budgetTokens, int maxCount) {
        List<AiMemoryContext> selected = new ArrayList<>();
        int usedTokens = 0;
        for (AiMemoryContext item : memories) {
            if (item == null || !StringUtils.hasText(item.content())) {
                continue;
            }
            if (selected.size() >= maxCount) {
                break;
            }
            int estimate = estimateTokens(item.content()) + 8;
            if (!selected.isEmpty() && usedTokens + estimate > budgetTokens) {
                break;
            }
            selected.add(item);
            usedTokens += estimate;
        }
        return selected;
    }

    private int estimateTokens(String text) {
        if (!StringUtils.hasText(text)) {
            return 0;
        }
        int length = text.codePointCount(0, text.length());
        return Math.max(1, length / 2);
    }
}

