package com.tsukimiai.hoshi.skill.knowledge.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.infrastructure.storage.ObjectStorageService;
import com.tsukimiai.hoshi.skill.knowledge.config.KnowledgeChunkProperties;
import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocument;
import com.tsukimiai.hoshi.skill.knowledge.mapper.KnowledgeDocumentMapper;
import com.tsukimiai.hoshi.skill.knowledge.support.KnowledgeDocumentParser;
import com.tsukimiai.hoshi.skill.knowledge.support.MarkdownStructureChunker;
import com.tsukimiai.hoshi.skill.knowledge.support.StructuredChunk;

@Service
@Transactional(readOnly = true)
public class KnowledgeIndexingService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeIndexingService.class);
    static final int EMBEDDING_BATCH_SIZE = 10;

    private final KnowledgeDocumentMapper mapper;
    private final KnowledgeDocumentService documentService;
    private final ObjectStorageService objectStorageService;
    private final VectorStore vectorStore;
    private final KnowledgeChunkProperties chunkProperties;
    private final KnowledgeDocumentSummarizer summarizer;

    private final KnowledgeDocumentParser parser = new KnowledgeDocumentParser();

    public KnowledgeIndexingService(
            KnowledgeDocumentMapper mapper,
            KnowledgeDocumentService documentService,
            ObjectStorageService objectStorageService,
            VectorStore vectorStore,
            KnowledgeChunkProperties chunkProperties,
            KnowledgeDocumentSummarizer summarizer) {
        this.mapper = mapper;
        this.documentService = documentService;
        this.objectStorageService = objectStorageService;
        this.vectorStore = vectorStore;
        this.chunkProperties = chunkProperties;
        this.summarizer = summarizer;
    }

    @Transactional
    public KnowledgeDocument index(Long userId, Long documentId) {
        KnowledgeDocument doc = documentService.get(userId, documentId);
        if (doc == null) {
            return null;
        }
        if (!StringUtils.hasText(doc.getStorageKey()) || "pending".equalsIgnoreCase(doc.getStorageKey())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "文档尚未上传完成");
        }
        documentService.markIndexing(documentId);

        KnowledgeDocument current = documentService.get(userId, documentId);
        if (current == null) {
            return null;
        }

        var storedObject = objectStorageService.getObject(current.getStorageKey()).orElse(null);
        if (storedObject == null) {
            documentService.markFailed(documentId, "无法读取已上传的文件对象");
            return mapper.selectById(documentId);
        }
        try (var inputStream = storedObject.inputStream()) {
            String rawText = parser.parse(current.getFilename(), current.getContentType(), inputStream);
            MarkdownStructureChunker chunker = new MarkdownStructureChunker(
                    chunkProperties.getChunk().getMaxChars(),
                    chunkProperties.getChunk().getOverlapChars());
            List<StructuredChunk> structuredChunks = chunker.chunk(current.getFilename(), rawText);
            if (structuredChunks.isEmpty()) {
                documentService.markFailed(documentId, "无法从文档中解析出文本内容");
                return mapper.selectById(documentId);
            }

            String docTitle = MarkdownStructureChunker.resolveDocTitle(current.getFilename());
            List<String> headingPaths = chunker.collectHeadingPaths(current.getFilename(), rawText);
            String summaryText = summarizer.summarize(docTitle, rawText, headingPaths);
            StructuredChunk summaryChunk = StructuredChunk.documentSummary(summaryText, docTitle);

            List<Document> documents = new ArrayList<>(structuredChunks.size() + 1);
            for (StructuredChunk chunk : structuredChunks) {
                documents.add(toDocument(userId, documentId, current, chunk));
            }
            documents.add(toDocument(userId, documentId, current, summaryChunk));

            if (documentService.get(userId, documentId) == null) {
                return null;
            }
            addInBatches(documents);
            documentService.markReady(documentId, documents.size());
            return mapper.selectById(documentId);
        } catch (Exception ex) {
            log.warn("Indexing failed for documentId={}: {}", documentId, ex.getMessage());
            log.debug("Indexing failure details", ex);
            documentService.markFailed(documentId, "索引失败：" + ex.getMessage());
            return mapper.selectById(documentId);
        }
    }

    private Document toDocument(Long userId, Long documentId, KnowledgeDocument current, StructuredChunk chunk) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("userId", String.valueOf(userId));
        metadata.put("documentId", String.valueOf(documentId));
        metadata.put("filename", current.getFilename());
        metadata.put("storageKey", current.getStorageKey());
        metadata.put("chunkKind", chunk.chunkKind());
        metadata.put("docTitle", chunk.docTitle());
        metadata.put("headingPath", chunk.headingPath() == null ? "" : chunk.headingPath());
        metadata.put("sectionIndex", String.valueOf(chunk.sectionIndex()));
        metadata.put("chunkIndex", String.valueOf(chunk.chunkIndex()));
        return new Document(chunk.content(), metadata);
    }

    private void addInBatches(List<Document> documents) {
        for (int start = 0; start < documents.size(); start += EMBEDDING_BATCH_SIZE) {
            int end = Math.min(start + EMBEDDING_BATCH_SIZE, documents.size());
            vectorStore.add(documents.subList(start, end));
        }
    }
}
