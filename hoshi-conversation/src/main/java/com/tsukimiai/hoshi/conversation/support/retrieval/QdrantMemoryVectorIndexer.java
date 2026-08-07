package com.tsukimiai.hoshi.conversation.support.retrieval;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.conversation.entity.UserMemory;

public class QdrantMemoryVectorIndexer implements MemoryVectorIndexer {

    private static final Logger log = LoggerFactory.getLogger(QdrantMemoryVectorIndexer.class);

    private static final String MEMORY_TYPE_LONG = "long";
    private static final String MEMORY_STATUS_ACTIVE = "active";

    private final VectorStore vectorStore;

    public QdrantMemoryVectorIndexer(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    @Override
    public void upsertLongMemory(UserMemory memory) {
        if (memory == null
                || memory.getId() == null
                || memory.getUserId() == null
                || !MEMORY_TYPE_LONG.equalsIgnoreCase(memory.getMemoryType())
                || !MEMORY_STATUS_ACTIVE.equalsIgnoreCase(memory.getStatus())
                || !StringUtils.hasText(memory.getContent())) {
            return;
        }

        try {
            deleteMemory(memory.getUserId(), memory.getId());

            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("userId", memory.getUserId());
            metadata.put("memoryId", memory.getId());
            metadata.put("memoryType", safeLower(memory.getMemoryType()));
            metadata.put("category", safeLower(memory.getCategory()));
            metadata.put("status", safeLower(memory.getStatus()));
            metadata.put("alwaysPinned", memory.getAlwaysPinned() != null && memory.getAlwaysPinned() == 1);
            metadata.put("importance", memory.getImportanceScore());
            metadata.put("updatedAt", memory.getUpdatedAt() == null ? null : memory.getUpdatedAt().toString());

            vectorStore.add(List.of(new Document(memory.getContent().trim(), metadata)));
        } catch (Exception ex) {
            log.warn("Failed to upsert memory vector: memoryId={}, reason={}",
                    memory.getId(), ex.getMessage());
            log.debug("Memory vector upsert failure details", ex);
        }
    }

    @Override
    public void deleteMemory(Long userId, Long memoryId) {
        if (userId == null || userId <= 0 || memoryId == null || memoryId <= 0) {
            return;
        }
        try {
            FilterExpressionBuilder builder = new FilterExpressionBuilder();
            var userFilter = builder.eq("userId", String.valueOf(userId));
            var memoryFilter = builder.eq("memoryId", String.valueOf(memoryId));
            vectorStore.delete(builder.and(userFilter, memoryFilter).build());
        } catch (Exception ex) {
            log.warn("Failed to delete memory vectors: userId={}, memoryId={}, reason={}",
                    userId, memoryId, ex.getMessage());
            log.debug("Memory vector delete failure details", ex);
        }
    }

    private String safeLower(String value) {
        return StringUtils.hasText(value) ? value.trim().toLowerCase(java.util.Locale.ROOT) : null;
    }
}

