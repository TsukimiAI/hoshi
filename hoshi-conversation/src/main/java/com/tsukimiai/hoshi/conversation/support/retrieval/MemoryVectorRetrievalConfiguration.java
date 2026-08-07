package com.tsukimiai.hoshi.conversation.support.retrieval;

import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.config.HoshiAiRagProperties;

@Configuration
public class MemoryVectorRetrievalConfiguration {

    @Bean
    @ConditionalOnMissingBean(MemoryVectorIndexer.class)
    MemoryVectorIndexer noopMemoryVectorIndexer() {
        return new NoopMemoryVectorIndexer();
    }

    @Bean
    @ConditionalOnProperty(prefix = "hoshi.ai.rag", name = "memory-enabled", havingValue = "true")
    @ConditionalOnBean(VectorStore.class)
    MemoryVectorIndexer qdrantMemoryVectorIndexer(VectorStore vectorStore) {
        return new QdrantMemoryVectorIndexer(vectorStore);
    }

    @Bean
    @ConditionalOnProperty(prefix = "hoshi.ai.rag", name = "memory-enabled", havingValue = "true")
    @ConditionalOnBean(VectorStore.class)
    VectorMemoryRetriever vectorMemoryRetriever(
            VectorStore vectorStore,
            HoshiAiRagProperties ragProperties,
            HoshiAiProperties hoshiAiProperties) {
        return new VectorMemoryRetriever(vectorStore, ragProperties, hoshiAiProperties);
    }

    @Bean
    @Primary
    @ConditionalOnProperty(prefix = "hoshi.ai.rag", name = "memory-enabled", havingValue = "true")
    @ConditionalOnBean(VectorMemoryRetriever.class)
    MemoryRetriever hybridMemoryRetriever(
            LexicalMemoryRetriever lexicalMemoryRetriever,
            VectorMemoryRetriever vectorMemoryRetriever,
            HoshiAiRagProperties ragProperties,
            HoshiAiProperties hoshiAiProperties) {
        return new HybridMemoryRetriever(lexicalMemoryRetriever, vectorMemoryRetriever, ragProperties, hoshiAiProperties);
    }
}

