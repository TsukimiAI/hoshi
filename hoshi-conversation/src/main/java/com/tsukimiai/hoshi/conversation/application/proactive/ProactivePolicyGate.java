package com.tsukimiai.hoshi.conversation.application.proactive;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTaskType;
import com.tsukimiai.hoshi.ai.cognition.ProactiveTimingJudgmentResult;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.application.ChatContextAssembler;
import com.tsukimiai.hoshi.conversation.application.ChatMessagePersistenceService;
import com.tsukimiai.hoshi.conversation.config.ProactiveConversationProperties;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;

@Component
public class ProactivePolicyGate {

    private final ProactiveConversationProperties properties;
    private final ProactiveHardRuleEvaluator hardRuleEvaluator;
    private final XingnaiChatService xingnaiChatService;
    private final HoshiAiProperties hoshiAiProperties;
    private final ChatContextAssembler chatContextAssembler;
    private final ChatSessionMapper chatSessionMapper;
    private final ChatMessagePersistenceService persistenceService;

    public ProactivePolicyGate(
            ProactiveConversationProperties properties,
            ProactiveHardRuleEvaluator hardRuleEvaluator,
            XingnaiChatService xingnaiChatService,
            HoshiAiProperties hoshiAiProperties,
            ChatContextAssembler chatContextAssembler,
            ChatSessionMapper chatSessionMapper,
            ChatMessagePersistenceService persistenceService) {
        this.properties = properties;
        this.hardRuleEvaluator = hardRuleEvaluator;
        this.xingnaiChatService = xingnaiChatService;
        this.hoshiAiProperties = hoshiAiProperties;
        this.chatContextAssembler = chatContextAssembler;
        this.chatSessionMapper = chatSessionMapper;
        this.persistenceService = persistenceService;
    }

    public boolean isEnabled() {
        return properties.isEnabled();
    }

    public Optional<String> getGlobalBlockReason(ProactivePolicyContext context) {
        return hardRuleEvaluator.evaluateGlobal(context);
    }

    public boolean passesLlmTimingJudgment(ProactiveCandidate candidate, ProactivePolicyContext context) {
        if (!properties.isEnabled() || !context.userEnabled()) {
            return false;
        }
        if (!hardRuleEvaluator.passesCandidateHardRules(candidate, context)) {
            return false;
        }
        AiCognitionTask task = new AiCognitionTask(
                null,
                AiCognitionTaskType.PROACTIVE_TIMING_JUDGMENT,
                candidate.userId(),
                candidate.sessionId(),
                candidate.sourceKey(),
                buildJudgmentInput(candidate, context));
        AiCognitionResult result = xingnaiChatService.runCognitionTask(task);
        if (!(result.result() instanceof ProactiveTimingJudgmentResult judgment)) {
            return false;
        }
        return judgment.shouldTrigger()
                && judgment.confidence() >= hoshiAiProperties.getProactiveTimingJudgmentMinConfidence();
    }

    /** @deprecated 使用 {@link #passesLlmTimingJudgment}；保留以兼容旧测试。 */
    @Deprecated
    public boolean passes(ProactiveCandidate candidate, ProactivePolicyContext context) {
        return passesLlmTimingJudgment(candidate, context);
    }

    public ProactiveCandidate pickCandidate(List<ProactiveCandidate> candidates, ProactivePolicyContext context) {
        if (getGlobalBlockReason(context).isPresent()) {
            return null;
        }
        List<ProactiveCandidate> topCandidates = hardRuleEvaluator.selectTopForTimingJudgment(candidates, context);
        if (topCandidates.isEmpty()) {
            return null;
        }
        for (ProactiveCandidate candidate : topCandidates) {
            if (passesLlmTimingJudgment(candidate, context)) {
                return candidate;
            }
        }
        return null;
    }

    public LocalDateTime startOfToday() {
        return LocalDate.now().atStartOfDay();
    }

    private AiCognitionInput buildJudgmentInput(ProactiveCandidate candidate, ProactivePolicyContext context) {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("sourceType", candidate.sourceType().getValue());
        metadata.put("hint", candidate.hint());
        metadata.put("priority", candidate.priority());
        metadata.put("currentHour", context.now().getHour());
        metadata.put("todayProactiveCount", context.todayProactiveCount());
        metadata.put("recentSourceKeys", String.join(",", context.recentSourceKeys()));
        metadata.put("minutesSinceLastUserMessage", minutesSince(context.now(), context.lastUserMessageAt()));
        metadata.put("minutesSinceLastProactive", minutesSince(context.now(), context.lastProactiveAt()));
        metadata.put("quietHoursStart", properties.getQuietHoursStart());
        metadata.put("quietHoursEnd", properties.getQuietHoursEnd());
        metadata.put("hardRulesApplied", true);

        ChatSession session = chatSessionMapper.selectById(candidate.sessionId());
        if (session == null) {
            return new AiCognitionInput(List.of(), null, metadata);
        }
        List<ChatMessage> messages = persistenceService.listRecentMessages(session.getId(), Integer.MAX_VALUE);
        return chatContextAssembler.buildProactiveCognitionContext(
                candidate.userId(),
                session,
                messages,
                candidate.hint(),
                metadata);
    }

    private long minutesSince(LocalDateTime now, LocalDateTime earlier) {
        if (earlier == null) {
            return -1;
        }
        return Duration.between(earlier, now).toMinutes();
    }
}
