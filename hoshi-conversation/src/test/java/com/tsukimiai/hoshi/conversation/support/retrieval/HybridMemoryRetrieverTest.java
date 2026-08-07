package com.tsukimiai.hoshi.conversation.support.retrieval;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.config.HoshiAiRagProperties;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;

class HybridMemoryRetrieverTest {

    @Test
    void retrieveLongMergesAndDedupes() {
        MemoryRetriever lexical = new MemoryRetriever() {
            @Override
            public List<AiMemoryContext> retrieveShort(Long userId, String query, int budgetTokens) {
                return List.of();
            }

            @Override
            public List<AiMemoryContext> retrieveLong(Long userId, String query, int budgetTokens) {
                return List.of(
                        new AiMemoryContext("1", "a", "long", "preference", "stable", 1.0, 1.0, 1.0, false),
                        new AiMemoryContext("2", "b", "long", "habit", "stable", 1.0, 1.0, 1.0, false));
            }
        };
        VectorMemoryRetriever vector = new VectorMemoryRetriever(null, new HoshiAiRagProperties(), new HoshiAiProperties()) {
            @Override
            public List<AiMemoryContext> retrieveLong(Long userId, String query, int budgetTokens) {
                return List.of(
                        new AiMemoryContext("2", "b2", "long", "habit", "stable", 1.0, 1.0, 1.0, false),
                        new AiMemoryContext("3", "c", "long", "identity", "stable", 1.0, 1.0, 1.0, false));
            }
        };
        HoshiAiRagProperties rag = new HoshiAiRagProperties();
        rag.setMemoryEnabled(true);
        HoshiAiProperties props = new HoshiAiProperties();
        props.setLongMemoryAlwaysPinnedLimit(4);
        props.setQueryRelevantLongMemoryLimit(4);

        HybridMemoryRetriever retriever = new HybridMemoryRetriever(lexical, vector, rag, props);
        List<AiMemoryContext> merged = retriever.retrieveLong(1L, "hello", 200);

        assertThat(merged).extracting(AiMemoryContext::id).containsExactly("1", "2", "3");
    }
}

