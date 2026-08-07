package com.tsukimiai.hoshi.conversation.support.retrieval;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.config.HoshiAiRagProperties;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;

public class VectorMemoryRetriever {

    private static final String MEMORY_TYPE_LONG = "long";

    private final VectorStore vectorStore;
    private final HoshiAiRagProperties ragProperties;

    public VectorMemoryRetriever(VectorStore vectorStore, HoshiAiRagProperties ragProperties, HoshiAiProperties hoshiAiProperties) {
        this.vectorStore = vectorStore;
        this.ragProperties = ragProperties;
    }

    public List<AiMemoryContext> retrieveLong(Long userId, String query, int budgetTokens) {
        if (userId == null || userId <= 0 || !StringUtils.hasText(query) || budgetTokens <= 0) {
            return List.of();
        }

        int topK = Math.max(1, ragProperties.getMemoryTopK());
        double minScore = clamp01(ragProperties.getMemoryMinScore());

        FilterExpressionBuilder filterBuilder = new FilterExpressionBuilder();
        var userFilter = filterBuilder.eq("userId", String.valueOf(userId));
        var typeFilter = filterBuilder.eq("memoryType", MEMORY_TYPE_LONG);
        var statusFilter = filterBuilder.eq("status", "active");
        SearchRequest request = SearchRequest.builder()
                .query(query.trim())
                .topK(topK)
                .similarityThreshold(minScore)
                .filterExpression(filterBuilder.and(filterBuilder.and(userFilter, typeFilter), statusFilter).build())
                .build();

        List<Document> docs = vectorStore.similaritySearch(request);
        List<AiMemoryContext> selected = new ArrayList<>();
        int usedTokens = 0;
        for (Document doc : docs) {
            if (doc == null || !StringUtils.hasText(doc.getText())) {
                continue;
            }
            Map<String, Object> meta = doc.getMetadata();
            String memoryId = asString(meta == null ? null : meta.get("memoryId"));
            if (!StringUtils.hasText(memoryId)) {
                continue;
            }
            String content = doc.getText().trim();
            int estimate = estimateTokens(content) + 8;
            if (!selected.isEmpty() && usedTokens + estimate > budgetTokens) {
                break;
            }
            selected.add(new AiMemoryContext(
                    memoryId,
                    content,
                    MEMORY_TYPE_LONG,
                    asString(meta == null ? null : meta.get("category")),
                    "stable",
                    null,
                    asDouble(meta == null ? null : meta.get("importance")),
                    1.0,
                    Boolean.TRUE.equals(meta == null ? null : meta.get("alwaysPinned"))));
            usedTokens += estimate;
        }
        return selected;
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Double asDouble(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private double clamp01(double v) {
        if (Double.isNaN(v)) {
            return 0.0;
        }
        return Math.max(0.0, Math.min(1.0, v));
    }

    private int estimateTokens(String text) {
        if (!StringUtils.hasText(text)) {
            return 0;
        }
        int length = text.codePointCount(0, text.length());
        return Math.max(1, length / 2);
    }
}

