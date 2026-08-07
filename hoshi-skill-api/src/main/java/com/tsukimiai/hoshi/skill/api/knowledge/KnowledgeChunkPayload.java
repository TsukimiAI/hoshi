package com.tsukimiai.hoshi.skill.api.knowledge;

public record KnowledgeChunkPayload(
        String title,
        String content,
        String source,
        Double score,
        String headingPath,
        String chunkKind) {
}
