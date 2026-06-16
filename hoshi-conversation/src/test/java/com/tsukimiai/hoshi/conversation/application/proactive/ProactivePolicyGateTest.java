package com.tsukimiai.hoshi.conversation.application.proactive;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionStatus;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTaskType;
import com.tsukimiai.hoshi.ai.cognition.ProactiveTimingJudgmentResult;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatContext;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.model.AiPromptBudget;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.application.ChatContextAssembler;
import com.tsukimiai.hoshi.conversation.application.ChatMessagePersistenceService;
import com.tsukimiai.hoshi.conversation.config.ProactiveConversationProperties;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.entity.ProactiveSourceType;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;

@ExtendWith(MockitoExtension.class)
class ProactivePolicyGateTest {

    @Mock
    private XingnaiChatService xingnaiChatService;

    @Mock
    private HoshiAiProperties hoshiAiProperties;

    @Mock
    private ChatContextAssembler chatContextAssembler;

    @Mock
    private ChatSessionMapper chatSessionMapper;

    @Mock
    private ChatMessagePersistenceService persistenceService;

    private ProactiveConversationProperties properties;
    private ProactiveHardRuleEvaluator hardRuleEvaluator;
    private ProactivePolicyGate gate;

    @BeforeEach
    void setUp() {
        properties = new ProactiveConversationProperties();
        hardRuleEvaluator = new ProactiveHardRuleEvaluator(properties);
        gate = new ProactivePolicyGate(
                properties,
                hardRuleEvaluator,
                xingnaiChatService,
                hoshiAiProperties,
                chatContextAssembler,
                chatSessionMapper,
                persistenceService);
    }

    @Test
    void blocksWhenUserDisabled() {
        ProactiveCandidate candidate = sampleCandidate();
        ProactivePolicyContext context = new ProactivePolicyContext(
                LocalDateTime.of(2026, 6, 15, 12, 0),
                LocalDateTime.of(2026, 6, 15, 10, 0),
                null,
                0,
                List.of(),
                false);

        assertThat(gate.getGlobalBlockReason(context)).contains("user_disabled");
        assertThat(gate.passesLlmTimingJudgment(candidate, context)).isFalse();
        verifyNoInteractions(xingnaiChatService);
    }

    @Test
    void allowsWhenModelApproves() {
        stubProactiveContext();
        when(hoshiAiProperties.getProactiveTimingJudgmentMinConfidence()).thenReturn(0.65);
        when(xingnaiChatService.runCognitionTask(any())).thenReturn(new AiCognitionResult(
                null,
                AiCognitionTaskType.PROACTIVE_TIMING_JUDGMENT,
                AiCognitionStatus.SUCCESS,
                "qwen-turbo",
                new ProactiveTimingJudgmentResult(true, "适合关心", 0.9),
                List.of(),
                "{}"));

        ProactiveCandidate candidate = sampleCandidate();
        ProactivePolicyContext context = healthyContext();

        assertThat(gate.passesLlmTimingJudgment(candidate, context)).isTrue();
        verify(chatContextAssembler).buildProactiveCognitionContext(
                eq(1L),
                any(ChatSession.class),
                any(),
                eq("老师最近在准备面试"),
                any());
    }

    @Test
    void blocksWhenModelRejects() {
        stubProactiveContext();
        when(xingnaiChatService.runCognitionTask(any())).thenReturn(new AiCognitionResult(
                null,
                AiCognitionTaskType.PROACTIVE_TIMING_JUDGMENT,
                AiCognitionStatus.SUCCESS,
                "qwen-turbo",
                new ProactiveTimingJudgmentResult(false, "用户刚聊过", 0.9),
                List.of(),
                "{}"));

        assertThat(gate.passesLlmTimingJudgment(sampleCandidate(), healthyContext())).isFalse();
    }

    @Test
    void pickCandidateOnlyJudgesTopN() {
        stubProactiveContext();
        when(xingnaiChatService.runCognitionTask(any())).thenReturn(new AiCognitionResult(
                null,
                AiCognitionTaskType.PROACTIVE_TIMING_JUDGMENT,
                AiCognitionStatus.SUCCESS,
                "qwen-turbo",
                new ProactiveTimingJudgmentResult(true, "暂不打扰", 0.1),
                List.of(),
                "{}"));

        properties.setTimingJudgmentTopN(2);
        when(hoshiAiProperties.getProactiveTimingJudgmentMinConfidence()).thenReturn(0.65);
        List<ProactiveCandidate> candidates = List.of(
                new ProactiveCandidate(1L, 2L, ProactiveSourceType.MEMORY, "memory:1", "A", 0.95, "plan"),
                new ProactiveCandidate(1L, 2L, ProactiveSourceType.MEMORY, "memory:2", "B", 0.9, "plan"),
                new ProactiveCandidate(1L, 2L, ProactiveSourceType.MEMORY, "memory:3", "C", 0.8, "plan"));

        assertThat(gate.pickCandidate(candidates, healthyContext())).isNull();
        verify(xingnaiChatService, org.mockito.Mockito.times(2)).runCognitionTask(any());
    }

    @Test
    void pickCandidateSkipsSourceKeyInCooldown() {
        ProactiveCandidate cooled = new ProactiveCandidate(
                1L, 2L, ProactiveSourceType.MEMORY, "memory:9", "冷却中", 0.99, "plan");
        ProactiveCandidate fresh = new ProactiveCandidate(
                1L, 2L, ProactiveSourceType.MEMORY, "memory:10", "老师最近在准备面试", 0.9, "temporary_goal");
        ProactivePolicyContext context = new ProactivePolicyContext(
                LocalDateTime.of(2026, 6, 15, 12, 0),
                LocalDateTime.of(2026, 6, 15, 10, 0),
                null,
                0,
                List.of("memory:9"),
                true);

        stubProactiveContext();
        when(hoshiAiProperties.getProactiveTimingJudgmentMinConfidence()).thenReturn(0.65);
        when(xingnaiChatService.runCognitionTask(any())).thenReturn(new AiCognitionResult(
                null,
                AiCognitionTaskType.PROACTIVE_TIMING_JUDGMENT,
                AiCognitionStatus.SUCCESS,
                "qwen-turbo",
                new ProactiveTimingJudgmentResult(true, "ok", 0.9),
                List.of(),
                "{}"));

        assertThat(gate.pickCandidate(List.of(cooled, fresh), context)).isNotNull();
        verify(xingnaiChatService).runCognitionTask(any());
    }

    @Test
    void globalBlockPreventsLlmCalls() {
        ProactivePolicyContext context = new ProactivePolicyContext(
                LocalDateTime.of(2026, 6, 15, 2, 0),
                LocalDateTime.of(2026, 6, 15, 10, 0),
                null,
                0,
                List.of(),
                true);

        assertThat(gate.getGlobalBlockReason(context)).contains("quiet_hours");
        assertThat(gate.pickCandidate(List.of(sampleCandidate()), context)).isNull();
        verify(xingnaiChatService, never()).runCognitionTask(any());
    }

    private ProactivePolicyContext healthyContext() {
        return new ProactivePolicyContext(
                LocalDateTime.of(2026, 6, 15, 12, 0),
                LocalDateTime.of(2026, 6, 15, 10, 0),
                null,
                0,
                List.of(),
                true);
    }

    private ProactiveCandidate sampleCandidate() {
        return new ProactiveCandidate(
                1L,
                2L,
                ProactiveSourceType.MEMORY,
                "memory:9",
                "老师最近在准备面试",
                0.9,
                "temporary_goal");
    }

    private void stubProactiveContext() {
        ChatSession session = new ChatSession();
        session.setId(2L);
        session.setUserId(1L);
        when(chatSessionMapper.selectById(2L)).thenReturn(session);
        when(persistenceService.listRecentMessages(2L, Integer.MAX_VALUE)).thenReturn(List.of());
        AiChatContext chatContext = new AiChatContext(
                List.of(new AiChatTurn("user", "你好")),
                null,
                List.of(),
                List.of(),
                List.of(),
                new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400));
        when(chatContextAssembler.buildProactiveCognitionContext(
                anyLong(),
                any(ChatSession.class),
                any(),
                any(),
                any())).thenAnswer(invocation -> {
            Map<String, Object> anchor = invocation.getArgument(4);
            Map<String, Object> metadata = new java.util.HashMap<>(anchor);
            metadata.put("chatContext", chatContext);
            return new com.tsukimiai.hoshi.ai.cognition.AiCognitionInput(
                    chatContext.recentTurns(),
                    chatContext.sessionSummary(),
                    metadata);
        });
    }
}
