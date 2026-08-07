package com.tsukimiai.hoshi.skill.api.knowledge;

import java.util.List;

public record KnowledgeRetrieveResponse(List<KnowledgeChunkPayload> chunks) {

    public KnowledgeRetrieveResponse {
        chunks = chunks == null ? List.of() : List.copyOf(chunks);
    }
}
