package com.tsukimiai.hoshi.skill.knowledge.service;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class KnowledgeIndexingDispatcher {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeIndexingDispatcher.class);

    private final KnowledgeIndexingService indexingService;
    private final Set<Long> inFlightDocumentIds = ConcurrentHashMap.newKeySet();

    public KnowledgeIndexingDispatcher(KnowledgeIndexingService indexingService) {
        this.indexingService = indexingService;
    }

    public void enqueue(Long userId, Long documentId) {
        if (documentId == null) {
            return;
        }
        if (!inFlightDocumentIds.add(documentId)) {
            log.debug("Skip enqueue for in-flight documentId={}", documentId);
            return;
        }
        runIndexing(userId, documentId);
    }

    @Async("knowledgeIndexingExecutor")
    void runIndexing(Long userId, Long documentId) {
        try {
            indexingService.index(userId, documentId);
        } catch (RuntimeException ex) {
            log.warn("Async indexing task failed: userId={}, documentId={}, reason={}", userId, documentId, ex.getMessage());
            log.debug("Async indexing failure details", ex);
        } finally {
            if (documentId != null) {
                inFlightDocumentIds.remove(documentId);
            }
        }
    }
}

