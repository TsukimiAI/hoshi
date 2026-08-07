package com.tsukimiai.hoshi.skill.knowledge.service;

import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.infrastructure.storage.ObjectStorageService;
import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocument;
import com.tsukimiai.hoshi.skill.knowledge.mapper.KnowledgeDocumentMapper;

@Service
@Transactional(readOnly = true)
public class KnowledgeAdminService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeAdminService.class);

    private final KnowledgeDocumentMapper mapper;
    private final ObjectStorageService objectStorageService;
    private final VectorStore vectorStore;
    private final KnowledgeDocumentService documentService;
    private final KnowledgeIndexingDispatcher indexingDispatcher;

    public KnowledgeAdminService(
            KnowledgeDocumentMapper mapper,
            ObjectStorageService objectStorageService,
            VectorStore vectorStore,
            KnowledgeDocumentService documentService,
            KnowledgeIndexingDispatcher indexingDispatcher) {
        this.mapper = mapper;
        this.objectStorageService = objectStorageService;
        this.vectorStore = vectorStore;
        this.documentService = documentService;
        this.indexingDispatcher = indexingDispatcher;
    }

    @Transactional
    public void delete(Long userId, Long documentId) {
        KnowledgeDocument doc = mapper.selectById(documentId);
        if (doc == null) {
            return;
        }
        if (!Objects.equals(doc.getUserId(), userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "无权限删除该文档");
        }
        deleteVectors(userId, documentId);
        if (StringUtils.hasText(doc.getStorageKey()) && !"pending".equalsIgnoreCase(doc.getStorageKey())) {
            try {
                objectStorageService.deleteObject(doc.getStorageKey());
            } catch (RuntimeException ex) {
                log.warn("Failed to delete storage object: key={}, reason={}", doc.getStorageKey(), ex.getMessage());
            }
        }
        mapper.deleteById(documentId);
    }

    @Transactional
    public KnowledgeDocument reindex(Long userId, Long documentId) {
        KnowledgeDocument doc = documentService.get(userId, documentId);
        if (doc == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "文档不存在");
        }
        deleteVectors(userId, documentId);
        documentService.markIndexing(documentId);
        indexingDispatcher.enqueue(userId, documentId);
        return mapper.selectById(documentId);
    }

    private void deleteVectors(Long userId, Long documentId) {
        try {
            var builder = new org.springframework.ai.vectorstore.filter.FilterExpressionBuilder();
            var userFilter = builder.eq("userId", String.valueOf(userId));
            var docFilter = builder.eq("documentId", String.valueOf(documentId));
            vectorStore.delete(builder.and(userFilter, docFilter).build());
        } catch (Exception ex) {
            log.warn("Failed to delete vectors for documentId={}: {}", documentId, ex.getMessage());
            log.debug("Vector deletion failure details", ex);
        }
    }
}

