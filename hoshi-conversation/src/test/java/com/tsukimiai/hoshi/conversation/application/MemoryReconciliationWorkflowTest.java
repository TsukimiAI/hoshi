package com.tsukimiai.hoshi.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionStatus;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTaskType;
import com.tsukimiai.hoshi.ai.cognition.MemoryReconciliationResult;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.model.AiSessionSummary;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.config.MemoryReconciliationProperties;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.support.RecentWindow;

@ExtendWith(MockitoExtension.class)
class MemoryReconciliationWorkflowTest {

    @Mock
    private MemoryReconciliationService memoryReconciliationService;
    @Mock
    private ChatSessionMapper chatSessionMapper;
    @Mock
    private ChatMessagePersistenceService persistenceService;
    @Mock
    private ChatContextAssembler chatContextAssembler;
    @Mock
    private SessionSummaryCodec sessionSummaryCodec;
    @Mock
    private XingnaiChatService xingnaiChatService;
    @Mock
    private MemoryReconciliationMetrics metrics;

    private MemoryReconciliationWorkflow workflow;

    @BeforeEach
    void setUp() {
        MemoryReconciliationProperties properties = new MemoryReconciliationProperties();
        properties.setMaxSessionsPerScan(2);
        properties.setArchivedLookbackDays(7);
        workflow = new MemoryReconciliationWorkflow(
                properties,
                memoryReconciliationService,
                chatSessionMapper,
                persistenceService,
                chatContextAssembler,
                sessionSummaryCodec,
                xingnaiChatService,
                new HoshiAiProperties(),
                metrics);
    }

    @Test
    void reconcileUserBuildsMultiSessionInputAndArchivedMetadata() {
        UserMemory active = new UserMemory();
        active.setId(11L);
        active.setMemoryType("short");
        active.setCategory("plan");
        active.setContent("明天晚上去外滩玩");
        active.setStatus("active");

        ChatSession primary = session(42L);
        ChatSession secondary = session(43L);
        when(memoryReconciliationService.listActiveMemories(1L)).thenReturn(List.of(active));
        when(chatSessionMapper.selectList(any())).thenReturn(List.of(primary, secondary));
        when(persistenceService.listRecentMessages(anyLong(), anyInt())).thenReturn(List.of());
        when(chatContextAssembler.selectRecentWindow(any(), any(), anyInt()))
                .thenReturn(new RecentWindow(
                        List.of(new AiChatTurn("user", "今晚去不了了")),
                        1L,
                        20))
                .thenReturn(new RecentWindow(
                        List.of(new AiChatTurn("assistant", "好的老师")),
                        2L,
                        20));
        when(sessionSummaryCodec.hydrateSessionSummary(primary)).thenReturn(
                new AiSessionSummary(1, 5L, "主会话摘要", List.of(), List.of(), List.of()));
        when(sessionSummaryCodec.hydrateSessionSummary(secondary)).thenReturn(
                new AiSessionSummary(1, 6L, "次会话摘要", List.of(), List.of(), List.of()));
        when(memoryReconciliationService.countArchivedSince(any(), any())).thenReturn(3L);
        when(memoryReconciliationService.listRecentArchivedContents(any(), any(), anyInt()))
                .thenReturn(List.of("明天晚上去外滩玩"));
        when(xingnaiChatService.runCognitionTask(any())).thenReturn(new AiCognitionResult(
                null,
                AiCognitionTaskType.MEMORY_RECONCILIATION,
                AiCognitionStatus.SUCCESS,
                "qwen-turbo",
                new MemoryReconciliationResult(List.of()),
                List.of(),
                "{}"));
        when(memoryReconciliationService.applyReconciliationOperations(
                any(), any(), any(), any(), any(Double.class), any())).thenReturn(2);

        workflow.reconcileUser(1L);

        ArgumentCaptor<AiCognitionTask> taskCaptor = ArgumentCaptor.forClass(AiCognitionTask.class);
        verify(xingnaiChatService).runCognitionTask(taskCaptor.capture());
        AiCognitionInput input = taskCaptor.getValue().input();
        assertThat(input.recentTurns()).extracting(AiChatTurn::content)
                .anyMatch(content -> content.contains("[session:42]"))
                .anyMatch(content -> content.contains("[session:43]"));
        assertThat(input.sessionSummary().summaryText()).contains("主会话摘要");
        assertThat(input.metadata()).containsEntry("archivedCountLast7Days", 3L);
        assertThat(String.valueOf(input.metadata().get("activeMemories"))).contains("[id=11]");
        assertThat(String.valueOf(input.metadata().get("additionalSessionSummaries"))).contains("sessionId=43");
        verify(memoryReconciliationService).applyReconciliationOperations(
                any(), any(), any(), any(), any(Double.class), any());
        verify(metrics).recordCompleted();
        verify(metrics).recordOperationsApplied(2);
    }

    private static ChatSession session(Long id) {
        ChatSession session = new ChatSession();
        session.setId(id);
        session.setUserId(1L);
        session.setUpdatedAt(LocalDateTime.now());
        return session;
    }
}
