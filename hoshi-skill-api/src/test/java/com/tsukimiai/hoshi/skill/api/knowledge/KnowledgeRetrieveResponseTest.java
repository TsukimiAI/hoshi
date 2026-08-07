package com.tsukimiai.hoshi.skill.api.knowledge;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class KnowledgeRetrieveResponseTest {

    @Test
    void nullChunksDefaultToEmptyList() {
        KnowledgeRetrieveResponse response = new KnowledgeRetrieveResponse(null);

        assertThat(response.chunks()).isEmpty();
    }

    @Test
    void chunksAreCopiedDefensively() {
        List<KnowledgeChunkPayload> source = new java.util.ArrayList<>();
        source.add(new KnowledgeChunkPayload("t", "c", "s", 1.0, null, null));
        KnowledgeRetrieveResponse response = new KnowledgeRetrieveResponse(source);
        source.clear();

        assertThat(response.chunks()).hasSize(1);
    }
}
