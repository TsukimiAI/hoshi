package com.tsukimiai.hoshi.conversation.application.proactive;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.conversation.config.ProactiveConversationProperties;

/**
 * 主动对话硬规则：在 LLM 时机判断之前执行，结果确定且可配置。
 * 静默时段、日上限、空闲/冷却、sourceKey 去重均在此处理，不交给模型。
 */
@Component
public class ProactiveHardRuleEvaluator {

    private final ProactiveConversationProperties properties;

    public ProactiveHardRuleEvaluator(ProactiveConversationProperties properties) {
        this.properties = properties;
    }

    public Optional<String> evaluateGlobal(ProactivePolicyContext context) {
        if (!properties.isEnabled()) {
            return Optional.of("disabled");
        }
        if (!context.userEnabled()) {
            return Optional.of("user_disabled");
        }
        if (isQuietHours(context.now())) {
            return Optional.of("quiet_hours");
        }
        if (context.todayProactiveCount() >= properties.getDailyLimit()) {
            return Optional.of("daily_limit");
        }
        long minutesSinceUser = minutesSince(context.now(), context.lastUserMessageAt());
        if (minutesSinceUser >= 0 && minutesSinceUser < properties.getMinIdleMinutes()) {
            return Optional.of("min_idle");
        }
        long minutesSinceProactive = minutesSince(context.now(), context.lastProactiveAt());
        if (minutesSinceProactive >= 0 && minutesSinceProactive < properties.getSessionCooldownMinutes()) {
            return Optional.of("session_cooldown");
        }
        return Optional.empty();
    }

    public List<ProactiveCandidate> filterEligibleCandidates(
            List<ProactiveCandidate> candidates,
            ProactivePolicyContext context) {
        return candidates.stream()
                .filter(candidate -> passesCandidateHardRules(candidate, context))
                .toList();
    }

    public List<ProactiveCandidate> selectTopForTimingJudgment(
            List<ProactiveCandidate> candidates,
            ProactivePolicyContext context) {
        List<ProactiveCandidate> eligible = filterEligibleCandidates(candidates, context);
        int topN = Math.max(1, properties.getTimingJudgmentTopN());
        return eligible.stream().limit(topN).toList();
    }

    public boolean passesCandidateHardRules(ProactiveCandidate candidate, ProactivePolicyContext context) {
        return candidate != null
                && candidate.sourceKey() != null
                && !context.recentSourceKeys().contains(candidate.sourceKey());
    }

    public boolean isQuietHours(LocalDateTime now) {
        int hour = now.getHour();
        int start = properties.getQuietHoursStart();
        int end = properties.getQuietHoursEnd();
        if (start == end) {
            return false;
        }
        if (start < end) {
            return hour >= start && hour < end;
        }
        return hour >= start || hour < end;
    }

    private long minutesSince(LocalDateTime now, LocalDateTime earlier) {
        if (earlier == null) {
            return -1;
        }
        return Duration.between(earlier, now).toMinutes();
    }
}
