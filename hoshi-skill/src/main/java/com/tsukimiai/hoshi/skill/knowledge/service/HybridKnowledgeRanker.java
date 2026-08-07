package com.tsukimiai.hoshi.skill.knowledge.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeChunkKinds;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeChunkPayload;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrievalIntents;
import com.tsukimiai.hoshi.skill.knowledge.config.KnowledgeChunkProperties;
import com.tsukimiai.hoshi.skill.knowledge.support.QueryTokenMatcher;

@Service
public class HybridKnowledgeRanker {

    private static final double VECTOR_WEIGHT = 0.65;
    private static final double LEXICAL_WEIGHT = 0.35;
    private static final double SUMMARY_BOOST = 0.15;

    private final VectorStore vectorStore;
    private final KnowledgeChunkProperties properties;

    public HybridKnowledgeRanker(VectorStore vectorStore, KnowledgeChunkProperties properties) {
        this.vectorStore = vectorStore;
        this.properties = properties;
    }

    public RankResult rank(
            Long userId,
            RetrievalPlan plan,
            String originalQuery,
            int topK,
            double minScore,
            int budgetTokens) {
        if (userId == null || userId <= 0 || plan == null || plan.queries().isEmpty()) {
            return new RankResult(List.of(), 0);
        }
        int candidateTopK = Math.max(topK, topK * Math.max(1, properties.getRetrieve().getCandidateMultiplier()));
        Map<String, ScoredCandidate> candidates = new LinkedHashMap<>();
        for (String query : plan.queries()) {
            if (!StringUtils.hasText(query)) {
                continue;
            }
            List<Document> docs = vectorSearch(userId, plan.lockedDocumentId(), query.trim(), candidateTopK, minScore);
            for (Document doc : docs) {
                if (doc == null || !StringUtils.hasText(doc.getText())) {
                    continue;
                }
                String key = candidateKey(doc);
                double vectorScore = doc.getScore() == null ? 0.0 : doc.getScore();
                double lexicalScore = QueryTokenMatcher.hitRate(originalQuery, doc.getText());
                double fusedScore = VECTOR_WEIGHT * vectorScore + LEXICAL_WEIGHT * lexicalScore;
                ScoredCandidate existing = candidates.get(key);
                if (existing == null || fusedScore > existing.fusedScore()) {
                    candidates.put(key, new ScoredCandidate(doc, fusedScore));
                }
            }
        }

        List<ScoredCandidate> ranked = new ArrayList<>(candidates.values());
        ranked.sort((left, right) -> Double.compare(
                adjustedScore(right, plan.intent()),
                adjustedScore(left, plan.intent())));

        List<KnowledgeChunkPayload> selected = new ArrayList<>();
        Map<String, Integer> sectionCounts = new HashMap<>();
        int maxPerSection = Math.max(1, properties.getRetrieve().getMaxChunksPerSection());
        int usedTokens = 0;
        for (ScoredCandidate candidate : ranked) {
            if (selected.size() >= topK) {
                break;
            }
            if (shouldSkipCandidate(candidate, plan.intent())) {
                continue;
            }
            String sectionKey = sectionKey(candidate.document());
            int usedInSection = sectionCounts.getOrDefault(sectionKey, 0);
            if (usedInSection >= maxPerSection) {
                continue;
            }
            KnowledgeChunkPayload payload = toPayload(candidate, plan.intent());
            int estimate = estimateTokens(payload.content()) + estimateTokens(payload.title()) + 8;
            if (!selected.isEmpty() && budgetTokens > 0 && usedTokens + estimate > budgetTokens) {
                break;
            }
            selected.add(payload);
            sectionCounts.put(sectionKey, usedInSection + 1);
            usedTokens += estimate;
        }
        return new RankResult(selected, candidates.size());
    }

    private List<Document> vectorSearch(Long userId, Long lockedDocumentId, String query, int topK, double minScore) {
        FilterExpressionBuilder filterBuilder = new FilterExpressionBuilder();
        var userFilter = filterBuilder.eq("userId", String.valueOf(userId));
        var filter = userFilter;
        if (lockedDocumentId != null) {
            var docFilter = filterBuilder.eq("documentId", String.valueOf(lockedDocumentId));
            filter = filterBuilder.and(userFilter, docFilter);
        }
        SearchRequest request = SearchRequest.builder()
                .query(query)
                .topK(topK)
                .similarityThreshold(clamp01(minScore))
                .filterExpression(filter.build())
                .build();
        return vectorStore.similaritySearch(request);
    }

    private KnowledgeChunkPayload toPayload(ScoredCandidate candidate, String intent) {
        Document doc = candidate.document();
        Map<String, Object> meta = doc.getMetadata();
        String filename = asString(meta == null ? null : meta.get("filename"));
        String headingPath = asString(meta == null ? null : meta.get("headingPath"));
        String chunkKind = asString(meta == null ? null : meta.get("chunkKind"));
        return new KnowledgeChunkPayload(
                buildTitle(filename, headingPath),
                doc.getText().trim(),
                buildSource(meta),
                adjustedScore(candidate, intent),
                StringUtils.hasText(headingPath) ? headingPath : null,
                StringUtils.hasText(chunkKind) ? chunkKind : null);
    }

    private boolean shouldSkipCandidate(ScoredCandidate candidate, String intent) {
        if (KnowledgeRetrievalIntents.DOCUMENT_SUMMARY.equals(intent)) {
            return false;
        }
        Map<String, Object> meta = candidate.document().getMetadata();
        String chunkKind = asString(meta == null ? null : meta.get("chunkKind"));
        return KnowledgeChunkKinds.DOCUMENT_SUMMARY.equals(chunkKind);
    }

    private double adjustedScore(ScoredCandidate candidate, String intent) {
        double score = candidate.fusedScore();
        if (KnowledgeRetrievalIntents.DOCUMENT_SUMMARY.equals(intent)) {
            Map<String, Object> meta = candidate.document().getMetadata();
            String chunkKind = asString(meta == null ? null : meta.get("chunkKind"));
            if (KnowledgeChunkKinds.DOCUMENT_SUMMARY.equals(chunkKind)) {
                score += SUMMARY_BOOST;
            }
        }
        return score;
    }

    private String candidateKey(Document doc) {
        Map<String, Object> meta = doc.getMetadata();
        String documentId = asString(meta == null ? null : meta.get("documentId"));
        String chunkIndex = asString(meta == null ? null : meta.get("chunkIndex"));
        return documentId + ":" + chunkIndex;
    }

    private String sectionKey(Document doc) {
        Map<String, Object> meta = doc.getMetadata();
        String documentId = asString(meta == null ? null : meta.get("documentId"));
        String headingPath = asString(meta == null ? null : meta.get("headingPath"));
        if (StringUtils.hasText(headingPath)) {
            return documentId + "|" + headingPath;
        }
        String sectionIndex = asString(meta == null ? null : meta.get("sectionIndex"));
        return documentId + "|section:" + sectionIndex;
    }

    private String buildTitle(String filename, String headingPath) {
        if (!StringUtils.hasText(filename)) {
            return headingPath;
        }
        if (!StringUtils.hasText(headingPath)) {
            return filename;
        }
        return filename + " > " + headingPath;
    }

    private String buildSource(Map<String, Object> meta) {
        if (meta == null) {
            return null;
        }
        Object documentId = meta.get("documentId");
        Object chunkIndex = meta.get("chunkIndex");
        if (documentId == null || chunkIndex == null) {
            return null;
        }
        return "knowledge:" + documentId + ":" + chunkIndex;
    }

    private String asString(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private double clamp01(double value) {
        if (Double.isNaN(value)) {
            return 0.0;
        }
        return Math.max(0.0, Math.min(1.0, value));
    }

    private int estimateTokens(String text) {
        if (!StringUtils.hasText(text)) {
            return 0;
        }
        int length = text.codePointCount(0, text.length());
        return Math.max(1, length / 2);
    }

    public record RankResult(List<KnowledgeChunkPayload> chunks, int candidateCount) {
    }

    private record ScoredCandidate(Document document, double fusedScore) {
    }
}
