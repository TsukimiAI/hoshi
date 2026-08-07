package com.tsukimiai.hoshi.skill.knowledge.service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeQueryIntentRules;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrievalIntents;
import com.tsukimiai.hoshi.skill.knowledge.config.KnowledgeChunkProperties;
import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocument;
import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocumentStatus;
import com.tsukimiai.hoshi.skill.knowledge.support.MarkdownStructureChunker;

@Service
public class KnowledgeQueryPlanner {

    private final KnowledgeDocumentService documentService;
    private final KnowledgeChunkProperties properties;

    public KnowledgeQueryPlanner(KnowledgeDocumentService documentService, KnowledgeChunkProperties properties) {
        this.documentService = documentService;
        this.properties = properties;
    }

    public RetrievalPlan plan(Long userId, String query) {
        return plan(userId, query, List.of());
    }

    public RetrievalPlan plan(Long userId, String query, List<String> contextQueries) {
        if (userId == null || userId <= 0 || !StringUtils.hasText(query)) {
            return new RetrievalPlan(KnowledgeRetrievalIntents.QA, null, List.of());
        }
        String trimmedQuery = query.trim();
        List<String> safeContext = contextQueries == null ? List.of() : contextQueries;
        List<KnowledgeDocument> readyDocs = documentService.list(userId, 200).stream()
                .filter(doc -> KnowledgeDocumentStatus.READY.name().equalsIgnoreCase(doc.getStatus()))
                .toList();

        Long lockedDocumentId = resolveLockedDocumentId(trimmedQuery, safeContext, readyDocs);
        String intent = resolveIntent(trimmedQuery, lockedDocumentId);
        List<String> queries = buildQueries(trimmedQuery, intent, lockedDocumentId, readyDocs);
        return new RetrievalPlan(intent, lockedDocumentId, queries);
    }

    private String resolveIntent(String query, Long lockedDocumentId) {
        if (KnowledgeQueryIntentRules.isSummaryLikeQuery(query)) {
            return KnowledgeRetrievalIntents.DOCUMENT_SUMMARY;
        }
        if (lockedDocumentId != null) {
            return KnowledgeRetrievalIntents.DOCUMENT_SCOPED;
        }
        return KnowledgeRetrievalIntents.QA;
    }

    private Long resolveLockedDocumentId(
            String query,
            List<String> contextQueries,
            List<KnowledgeDocument> readyDocs) {
        if (readyDocs.isEmpty()) {
            return null;
        }
        Long locked = resolveLockedDocumentIdFromQuery(query, readyDocs);
        if (locked != null) {
            return locked;
        }
        for (int index = contextQueries.size() - 1; index >= 0; index--) {
            locked = resolveLockedDocumentIdFromQuery(contextQueries.get(index), readyDocs);
            if (locked != null) {
                return locked;
            }
        }
        if (readyDocs.size() == 1 && shouldLockSingleDocument(query, contextQueries)) {
            return readyDocs.get(0).getId();
        }
        return null;
    }

    private Long resolveLockedDocumentIdFromQuery(String query, List<KnowledgeDocument> readyDocs) {
        if (!StringUtils.hasText(query)) {
            return null;
        }
        for (KnowledgeDocument doc : readyDocs) {
            if (KnowledgeQueryIntentRules.filenameMatchesQuery(doc.getFilename(), query)) {
                return doc.getId();
            }
        }
        return null;
    }

    private boolean shouldLockSingleDocument(String query, List<String> contextQueries) {
        if (KnowledgeQueryIntentRules.referencesDocument(query)) {
            return true;
        }
        if (KnowledgeQueryIntentRules.isFollowUpLikeQuery(query)
                && KnowledgeQueryIntentRules.hasDocumentSignalInContext(contextQueries)) {
            return true;
        }
        return KnowledgeQueryIntentRules.isFollowUpLikeQuery(query)
                && KnowledgeQueryIntentRules.isSummaryLikeQuery(findLatestContextQuery(contextQueries));
    }

    private String findLatestContextQuery(List<String> contextQueries) {
        if (contextQueries.isEmpty()) {
            return "";
        }
        return contextQueries.get(contextQueries.size() - 1);
    }

    private List<String> buildQueries(
            String query,
            String intent,
            Long lockedDocumentId,
            List<KnowledgeDocument> readyDocs) {
        LinkedHashSet<String> queries = new LinkedHashSet<>();
        queries.add(query);
        String docTitle = resolveDocTitle(lockedDocumentId, readyDocs);
        String topicFocus = KnowledgeQueryIntentRules.extractTopicFocus(query);

        if (KnowledgeRetrievalIntents.DOCUMENT_SUMMARY.equals(intent)) {
            if (StringUtils.hasText(docTitle)) {
                queries.add(docTitle + " 文档摘要");
                queries.add(docTitle + " 章节大纲");
            } else {
                queries.add("文档摘要");
                queries.add("章节大纲");
            }
        } else if (lockedDocumentId != null) {
            if (StringUtils.hasText(docTitle)) {
                queries.add(docTitle);
            }
            if (StringUtils.hasText(topicFocus)) {
                if (StringUtils.hasText(docTitle)) {
                    queries.add(docTitle + " " + topicFocus);
                }
                queries.add(topicFocus);
            }
        }

        int maxQueries = Math.max(1, properties.getRetrieve().getMaxQueries());
        return new ArrayList<>(queries).stream().limit(maxQueries).toList();
    }

    private String resolveDocTitle(Long lockedDocumentId, List<KnowledgeDocument> readyDocs) {
        if (lockedDocumentId == null) {
            return null;
        }
        return readyDocs.stream()
                .filter(doc -> Objects.equals(doc.getId(), lockedDocumentId))
                .map(doc -> MarkdownStructureChunker.resolveDocTitle(doc.getFilename()))
                .findFirst()
                .orElse(null);
    }
}
