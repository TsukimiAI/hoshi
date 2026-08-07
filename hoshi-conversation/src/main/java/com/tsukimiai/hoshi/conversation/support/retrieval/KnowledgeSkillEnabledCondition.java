package com.tsukimiai.hoshi.conversation.support.retrieval;

import org.springframework.boot.autoconfigure.condition.AnyNestedCondition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/**
 * Knowledge skill HTTP client is on when chat knowledge RAG is enabled,
 * or when the legacy {@code hoshi.skill.knowledge.enabled} flag is set.
 */
public final class KnowledgeSkillEnabledCondition extends AnyNestedCondition {

    public KnowledgeSkillEnabledCondition() {
        super(ConfigurationPhase.REGISTER_BEAN);
    }

    @ConditionalOnProperty(prefix = "hoshi.ai.rag", name = "knowledge-enabled", havingValue = "true")
    static final class OnKnowledgeEnabled {
    }

    @ConditionalOnProperty(prefix = "hoshi.skill.knowledge", name = "enabled", havingValue = "true")
    static final class OnLegacySkillEnabled {
    }
}
