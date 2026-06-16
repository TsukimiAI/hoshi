package com.tsukimiai.hoshi.conversation.application.proactive;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.ai.model.AiChatContext;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionStatus;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTaskType;
import com.tsukimiai.hoshi.ai.cognition.ProactiveFollowUpContentResult;
import com.tsukimiai.hoshi.ai.cognition.ProactiveFollowUpJudgmentResult;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.application.ChatContextAssembler;
import com.tsukimiai.hoshi.conversation.application.ChatMessagePersistenceService;
import com.tsukimiai.hoshi.conversation.config.ProactiveConversationProperties;
import com.tsukimiai.hoshi.conversation.dto.UserProactivePreferencesResponse;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageSource;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.mapper.ProactiveFollowUpLogMapper;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.service.UserProactivePreferencesService;
import com.tsukimiai.hoshi.conversation.support.StreamPlaybackContext;
import com.tsukimiai.hoshi.user.entity.User;

@ExtendWith(MockitoExtension.class)
class ProactiveFollowUpWorkflowTest {

    @Mock
    private ProactiveReplyTracker replyTracker;
    @Mock
    private ChatMessagePersistenceService persistenceService;
    @Mock
    private ChatSessionService chatSessionService;
    @Mock
    private ChatContextAssembler chatContextAssembler;
    @Mock
    private XingnaiChatService xingnaiChatService;
    @Mock
    private UserProactivePreferencesService userProactivePreferencesService;
    @Mock
    private ProactiveFollowUpLogMapper proactiveFollowUpLogMapper;

    private ProactiveConversationProperties properties;
    private ProactiveFollowUpWorkflow workflow;
    private User user;

    @BeforeEach
    void setUp() {
        properties = new ProactiveConversationProperties();
        workflow = new ProactiveFollowUpWorkflow(
                properties,
                replyTracker,
                persistenceService,
                chatSessionService,
                chatContextAssembler,
                xingnaiChatService,
                userProactivePreferencesService,
                proactiveFollowUpLogMapper);
        user = new User();
        user.setId(1L);
    }

    @Test
    void allowsFollowUpAfterUserReplyWithoutProactiveLog() {
        when(userProactivePreferencesService.getEffectiveForUserId(1L))
                .thenReturn(new UserProactivePreferencesResponse(true, true));

        assertThat(workflow.canRunFollowUp(user, 42L)).isTrue();
        verifyNoInteractions(replyTracker);
    }

    @Test
    void blocksWhenServerFollowUpDisabled() {
        properties.getFollowUp().setEnabled(false);

        assertThat(workflow.canRunFollowUp(user, 42L)).isFalse();
        verifyNoInteractions(replyTracker, userProactivePreferencesService);
    }

    @Test
    void blocksWhenUserFollowUpDisabled() {
        when(userProactivePreferencesService.getEffectiveForUserId(1L))
                .thenReturn(new UserProactivePreferencesResponse(true, false));

        assertThat(workflow.canRunFollowUp(user, 42L)).isFalse();
        verifyNoInteractions(replyTracker);
    }

    @Test
    void runsFirstFollowUpRoundWithLowerConfidenceThreshold() {
        properties.getFollowUp().setFirstRoundJudgmentMinConfidence(0.4);
        properties.getFollowUp().setJudgmentMinConfidence(0.5);

        ChatSession session = new ChatSession();
        session.setId(42L);
        when(persistenceService.listRecentMessages(42L, Integer.MAX_VALUE)).thenReturn(List.of());
        when(chatSessionService.get(user, 42L)).thenReturn(session);
        when(chatContextAssembler.buildChatContext(1L, session, List.of()))
                .thenReturn(new AiChatContext(
                        List.of(new AiChatTurn("user", "老师今天好累")),
                        null,
                        List.of(),
                        List.of(),
                        List.of(),
                        null));
        when(chatContextAssembler.findLatestUserMessage(any())).thenReturn("老师今天好累");
        when(chatContextAssembler.buildProactiveCognitionContext(any(), any(), any(), any(), any()))
                .thenReturn(new AiCognitionInput(List.of(), null, null));
        when(xingnaiChatService.runCognitionTask(any())).thenAnswer(invocation -> {
            AiCognitionTask task = invocation.getArgument(0);
            if (task.taskType() == AiCognitionTaskType.PROACTIVE_FOLLOW_UP_JUDGMENT) {
                return new AiCognitionResult(
                        null,
                        task.taskType(),
                        AiCognitionStatus.SUCCESS,
                        "test",
                        new ProactiveFollowUpJudgmentResult(true, "continue", "承接情绪", 0.42, false),
                        List.of(),
                        "{}");
            }
            return new AiCognitionResult(
                    null,
                    task.taskType(),
                    AiCognitionStatus.SUCCESS,
                    "test",
                    new ProactiveFollowUpContentResult("老师先歇一会儿也好。", "normal", 0.8),
                    List.of(),
                    "{}");
        });

        ChatMessage saved = new ChatMessage();
        saved.setId(99L);
        saved.setContent("老师先歇一会儿也好。");

        ProactiveFollowUpWorkflow.FollowUpLoopResult result = workflow.runFollowUpLoop(
                user,
                42L,
                (round, mode, content, source, playback) -> {
                    assertThat(round).isEqualTo(1);
                    assertThat(mode).isEqualTo("continue");
                    assertThat(source).isEqualTo(ChatMessageSource.FOLLOW_UP_CONTINUE);
                    return saved;
                },
                new StreamPlaybackContext(0, 0));

        assertThat(result.totalRounds()).isEqualTo(1);
        assertThat(result.endReason()).isEqualTo("承接情绪");
    }

    @Test
    void stopsFollowUpOnSecondRoundWhenConfidenceTooLow() {
        properties.getFollowUp().setFirstRoundJudgmentMinConfidence(0.4);
        properties.getFollowUp().setJudgmentMinConfidence(0.5);

        ChatSession session = new ChatSession();
        session.setId(42L);
        when(persistenceService.listRecentMessages(42L, Integer.MAX_VALUE)).thenReturn(List.of());
        when(chatSessionService.get(user, 42L)).thenReturn(session);
        when(chatContextAssembler.buildChatContext(1L, session, List.of()))
                .thenReturn(new AiChatContext(
                        List.of(new AiChatTurn("user", "老师今天好累")),
                        null,
                        List.of(),
                        List.of(),
                        List.of(),
                        null));
        when(chatContextAssembler.findLatestUserMessage(any())).thenReturn("老师今天好累");
        when(chatContextAssembler.buildProactiveCognitionContext(any(), any(), any(), any(), any()))
                .thenReturn(new AiCognitionInput(List.of(), null, null));

        java.util.concurrent.atomic.AtomicInteger judgmentCalls = new java.util.concurrent.atomic.AtomicInteger();
        when(xingnaiChatService.runCognitionTask(any())).thenAnswer(invocation -> {
            AiCognitionTask task = invocation.getArgument(0);
            if (task.taskType() == AiCognitionTaskType.PROACTIVE_FOLLOW_UP_JUDGMENT) {
                int call = judgmentCalls.incrementAndGet();
                double confidence = call == 1 ? 0.55 : 0.42;
                return new AiCognitionResult(
                        null,
                        task.taskType(),
                        AiCognitionStatus.SUCCESS,
                        "test",
                        new ProactiveFollowUpJudgmentResult(true, "continue", "还想多说", confidence, false),
                        List.of(),
                        "{}");
            }
            return new AiCognitionResult(
                    null,
                    task.taskType(),
                    AiCognitionStatus.SUCCESS,
                    "test",
                    new ProactiveFollowUpContentResult("老师先歇一会儿也好。", "normal", 0.8),
                    List.of(),
                    "{}");
        });

        ChatMessage saved = new ChatMessage();
        saved.setId(99L);

        ProactiveFollowUpWorkflow.FollowUpLoopResult result = workflow.runFollowUpLoop(
                user,
                42L,
                (round, mode, content, source, playback) -> saved,
                new StreamPlaybackContext(0, 0));

        assertThat(result.totalRounds()).isEqualTo(1);
        assertThat(result.endReason()).isEqualTo("还想多说");
    }
}
