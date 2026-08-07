package com.tsukimiai.hoshi.conversation.support.retrieval;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class NoopKnowledgeRetrieverConfiguration {

    @Bean
    @ConditionalOnMissingBean(KnowledgeRetriever.class)
    KnowledgeRetriever noopKnowledgeRetriever() {
        return new NoopKnowledgeRetriever();
    }
}
