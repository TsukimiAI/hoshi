package com.tsukimiai.hoshi.skill.api.knowledge;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class KnowledgeQueryIntentRulesTest {

    @Test
    void detectsSummaryLikeQueries() {
        assertThat(KnowledgeQueryIntentRules.isSummaryLikeQuery("请总结我的文档")).isTrue();
        assertThat(KnowledgeQueryIntentRules.isSummaryLikeQuery("Redis 持久化")).isFalse();
    }

    @Test
    void normalizesFilenameTokens() {
        assertThat(KnowledgeQueryIntentRules.normalizeFilenameToken("面试知识梳理.md"))
                .isEqualTo("面试知识梳理");
    }

    @Test
    void extractsTopicFocusFromFollowUpQuery() {
        assertThat(KnowledgeQueryIntentRules.extractTopicFocus("其中对于AI的笔记，有没有什么错误的？"))
                .isEqualTo("AI");
    }

    @Test
    void detectsFollowUpQueries() {
        assertThat(KnowledgeQueryIntentRules.isFollowUpLikeQuery("其中对于AI的部分有没有问题")).isTrue();
    }
}
