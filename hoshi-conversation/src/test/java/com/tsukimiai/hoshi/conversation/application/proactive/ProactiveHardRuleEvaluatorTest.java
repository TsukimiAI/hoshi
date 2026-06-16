package com.tsukimiai.hoshi.conversation.application.proactive;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.tsukimiai.hoshi.conversation.config.ProactiveConversationProperties;
import com.tsukimiai.hoshi.conversation.entity.ProactiveSourceType;

class ProactiveHardRuleEvaluatorTest {

    private ProactiveConversationProperties properties;
    private ProactiveHardRuleEvaluator evaluator;

    @BeforeEach
    void setUp() {
        properties = new ProactiveConversationProperties();
        evaluator = new ProactiveHardRuleEvaluator(properties);
    }

    @Test
    void blocksDuringQuietHoursWrappingMidnight() {
        ProactivePolicyContext context = contextAt(LocalDateTime.of(2026, 6, 15, 1, 0));
        assertThat(evaluator.evaluateGlobal(context)).contains("quiet_hours");
        assertThat(evaluator.isQuietHours(LocalDateTime.of(2026, 6, 15, 12, 0))).isFalse();
    }

    @Test
    void blocksWhenDailyLimitReached() {
        properties.setDailyLimit(2);
        ProactivePolicyContext context = new ProactivePolicyContext(
                LocalDateTime.of(2026, 6, 15, 12, 0),
                LocalDateTime.of(2026, 6, 15, 8, 0),
                null,
                2,
                List.of(),
                true);
        assertThat(evaluator.evaluateGlobal(context)).contains("daily_limit");
    }

    @Test
    void filtersSourceKeyInCooldown() {
        ProactiveCandidate cooled = candidate("memory:1", 0.9);
        ProactiveCandidate fresh = candidate("memory:2", 0.8);
        ProactivePolicyContext context = new ProactivePolicyContext(
                LocalDateTime.of(2026, 6, 15, 12, 0),
                LocalDateTime.of(2026, 6, 15, 8, 0),
                null,
                0,
                List.of("memory:1"),
                true);

        assertThat(evaluator.filterEligibleCandidates(List.of(cooled, fresh), context))
                .containsExactly(fresh);
    }

    @Test
    void selectTopForTimingJudgmentRespectsTopN() {
        properties.setTimingJudgmentTopN(1);
        List<ProactiveCandidate> candidates = List.of(
                candidate("memory:1", 0.95),
                candidate("memory:2", 0.9));
        ProactivePolicyContext context = contextAt(LocalDateTime.of(2026, 6, 15, 12, 0));

        assertThat(evaluator.selectTopForTimingJudgment(candidates, context)).hasSize(1);
    }

    private ProactivePolicyContext contextAt(LocalDateTime now) {
        return new ProactivePolicyContext(
                now,
                now.minusHours(2),
                null,
                0,
                List.of(),
                true);
    }

    private ProactiveCandidate candidate(String sourceKey, double priority) {
        return new ProactiveCandidate(
                1L,
                2L,
                ProactiveSourceType.MEMORY,
                sourceKey,
                "hint",
                priority,
                "plan");
    }
}
