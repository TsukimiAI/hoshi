package com.tsukimiai.hoshi.skill;

import java.util.List;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.ai.vectorstore.filter.Filter;

@TestConfiguration
public class TestVectorStoreConfiguration {

    @Bean
    VectorStore vectorStore() {
        return new VectorStore() {
            @Override
            public void add(List<Document> documents) {
                // no-op
            }

            @Override
            public void delete(List<String> ids) {
                // no-op
            }

            @Override
            public void delete(Filter.Expression filterExpression) {
                // no-op
            }

            @Override
            public List<Document> similaritySearch(SearchRequest request) {
                return List.of();
            }
        };
    }
}

