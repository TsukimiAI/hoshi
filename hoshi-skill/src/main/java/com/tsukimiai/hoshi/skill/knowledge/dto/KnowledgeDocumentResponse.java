package com.tsukimiai.hoshi.skill.knowledge.dto;

import java.time.LocalDateTime;

import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocument;

public record KnowledgeDocumentResponse(
        Long id,
        Long userId,
        String filename,
        String contentType,
        String storageKey,
        String status,
        int chunkCount,
        String errorMessage,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static KnowledgeDocumentResponse from(KnowledgeDocument doc) {
        if (doc == null) {
            return null;
        }
        return new KnowledgeDocumentResponse(
                doc.getId(),
                doc.getUserId(),
                doc.getFilename(),
                doc.getContentType(),
                doc.getStorageKey(),
                doc.getStatus(),
                doc.getChunkCount() == null ? 0 : doc.getChunkCount(),
                doc.getErrorMessage(),
                doc.getCreatedAt(),
                doc.getUpdatedAt());
    }
}

