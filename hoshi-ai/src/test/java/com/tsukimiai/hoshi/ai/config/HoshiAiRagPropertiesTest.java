package com.tsukimiai.hoshi.ai.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class HoshiAiRagPropertiesTest {

    @Test
    void knowledgeRetrievalInactiveByDefault() {
        HoshiAiRagProperties properties = new HoshiAiRagProperties();

        assertThat(properties.isEnabled()).isFalse();
        assertThat(properties.isKnowledgeEnabled()).isFalse();
        assertThat(properties.isKnowledgeRetrievalActive()).isFalse();
        assertThat(properties.isServerVectorStoreEnabled()).isFalse();
    }

    @Test
    void knowledgeRetrievalUsesKnowledgeEnabledAlone() {
        HoshiAiRagProperties properties = new HoshiAiRagProperties();

        properties.setKnowledgeEnabled(true);

        assertThat(properties.isKnowledgeRetrievalActive()).isTrue();
        assertThat(properties.isServerVectorStoreEnabled()).isFalse();
    }

    @Test
    void memoryEnabledTurnsOnServerVectorStore() {
        HoshiAiRagProperties properties = new HoshiAiRagProperties();

        properties.setMemoryEnabled(true);

        assertThat(properties.isMemoryRetrievalActive()).isTrue();
        assertThat(properties.isServerVectorStoreEnabled()).isTrue();
    }
}
