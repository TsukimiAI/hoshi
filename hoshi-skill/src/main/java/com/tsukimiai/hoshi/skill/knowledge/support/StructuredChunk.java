package com.tsukimiai.hoshi.skill.knowledge.support;

import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeChunkKinds;

public record StructuredChunk(
        String content,
        String docTitle,
        String headingPath,
        int sectionIndex,
        int chunkIndex,
        String chunkKind) {

    public static StructuredChunk content(
            String content, String docTitle, String headingPath, int sectionIndex, int chunkIndex) {
        return new StructuredChunk(
                content, docTitle, headingPath, sectionIndex, chunkIndex, KnowledgeChunkKinds.CONTENT);
    }

    public static StructuredChunk documentSummary(String content, String docTitle) {
        return new StructuredChunk(content, docTitle, "", -1, -1, KnowledgeChunkKinds.DOCUMENT_SUMMARY);
    }
}
