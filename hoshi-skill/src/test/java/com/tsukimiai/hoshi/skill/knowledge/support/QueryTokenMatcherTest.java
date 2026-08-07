package com.tsukimiai.hoshi.skill.knowledge.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class QueryTokenMatcherTest {

    @Test
    void hitRatePrefersMatchingTokens() {
        double score = QueryTokenMatcher.hitRate("Redis 持久化", "Redis 支持 RDB 和 AOF 持久化方案");

        assertThat(score).isGreaterThan(0.3);
    }

    @Test
    void hitRateIsZeroForEmptyQuery() {
        assertThat(QueryTokenMatcher.hitRate("   ", "content")).isZero();
    }
}
