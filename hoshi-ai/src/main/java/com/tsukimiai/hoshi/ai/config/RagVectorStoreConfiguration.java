package com.tsukimiai.hoshi.ai.config;

import org.springframework.ai.vectorstore.qdrant.autoconfigure.QdrantVectorStoreAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigureAfter;
import org.springframework.boot.autoconfigure.condition.AnyNestedCondition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

/**
 * Enables Qdrant on the server when memory vector RAG is on ({@code memory-enabled})
 * or when {@code hoshi.ai.rag.enabled=true} (legacy override).
 * Knowledge vectors live in hoshi-skill, not here.
 */
@Configuration
@Conditional(RagVectorStoreConfiguration.ServerVectorStoreEnabledCondition.class)
@EnableConfigurationProperties(HoshiAiRagProperties.class)
@AutoConfigureAfter(QdrantVectorStoreAutoConfiguration.class)
@Import(QdrantVectorStoreAutoConfiguration.class)
public class RagVectorStoreConfiguration {

    static final class ServerVectorStoreEnabledCondition extends AnyNestedCondition {

        ServerVectorStoreEnabledCondition() {
            super(ConfigurationPhase.REGISTER_BEAN);
        }

        @ConditionalOnProperty(prefix = "hoshi.ai.rag", name = "memory-enabled", havingValue = "true")
        static final class OnMemoryEnabled {
        }

        @ConditionalOnProperty(prefix = "hoshi.ai.rag", name = "enabled", havingValue = "true")
        static final class OnLegacyEnabled {
        }
    }
}
