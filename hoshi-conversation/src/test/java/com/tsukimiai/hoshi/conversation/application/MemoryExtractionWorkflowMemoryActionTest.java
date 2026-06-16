package com.tsukimiai.hoshi.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.ai.cognition.AiMemoryCandidate;
import com.tsukimiai.hoshi.ai.cognition.AiMemoryEvidence;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.UserMemoryMapper;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.support.retrieval.MemoryRetriever;

@ExtendWith(MockitoExtension.class)
class MemoryExtractionWorkflowMemoryActionTest {

    @Mock
    private UserMemoryMapper userMemoryMapper;
    @Mock
    private ChatSessionService chatSessionService;
    @Mock
    private ChatMessagePersistenceService persistenceService;
    @Mock
    private XingnaiChatService xingnaiChatService;
    @Mock
    private SessionSummaryCodec sessionSummaryCodec;
    @Mock
    private MemoryReconciliationService memoryReconciliationService;
    @Mock
    private MemoryRetriever memoryRetriever;

    private MemoryExtractionWorkflow workflow;
    private HoshiAiProperties hoshiAiProperties;

    @BeforeEach
    void setUp() {
        hoshiAiProperties = new HoshiAiProperties();
        workflow = new MemoryExtractionWorkflow(
                userMemoryMapper,
                chatSessionService,
                persistenceService,
                xingnaiChatService,
                hoshiAiProperties,
                sessionSummaryCodec,
                memoryReconciliationService,
                memoryRetriever);
    }

    @Test
    void applyMemoryCandidatesSupersedesBundPlan() throws Exception {
        UserMemory oldPlan = activeShortMemory(11L, "plan", "明天晚上去外滩玩");
        when(userMemoryMapper.selectList(any())).thenReturn(List.of(oldPlan));
        when(memoryReconciliationService.resolveTargetMemory(eq(1L), eq(List.of(oldPlan)), any()))
                .thenReturn(oldPlan);

        invokeApplyMemoryCandidates(1L, 2L, 99L, List.of(supersedeCandidate()));

        verify(memoryReconciliationService).archiveMemory(oldPlan);
        ArgumentCaptor<UserMemory> insertCaptor = ArgumentCaptor.forClass(UserMemory.class);
        verify(userMemoryMapper).insert(insertCaptor.capture());
        assertThat(insertCaptor.getValue().getSupersedesMemoryId()).isEqualTo(11L);
    }

    @Test
    void reinforceExistingMemoryUsesCandidateContent() throws Exception {
        UserMemory existing = activeShortMemory(11L, "plan", "明天晚上去外滩玩");
        AiMemoryCandidate candidate = new AiMemoryCandidate(
                "老师改去静安寺",
                "short",
                "plan",
                "recent",
                "reinforce",
                null,
                null,
                0.9,
                0.8,
                "改期",
                new AiMemoryEvidence("user", "改去静安寺"));

        Method method = MemoryExtractionWorkflow.class.getDeclaredMethod(
                "reinforceExistingMemory", UserMemory.class, AiMemoryCandidate.class);
        method.setAccessible(true);
        method.invoke(workflow, existing, candidate);

        assertThat(existing.getContent()).isEqualTo("老师改去静安寺");
        verify(userMemoryMapper).updateById(existing);
    }

    @SuppressWarnings("unchecked")
    private void invokeApplyMemoryCandidates(
            Long userId,
            Long sessionId,
            Long sourceMessageId,
            List<AiMemoryCandidate> candidates) throws Exception {
        Method method = MemoryExtractionWorkflow.class.getDeclaredMethod(
                "applyMemoryCandidates", Long.class, Long.class, Long.class, List.class);
        method.setAccessible(true);
        method.invoke(workflow, userId, sessionId, sourceMessageId, candidates);
    }

    private static AiMemoryCandidate supersedeCandidate() {
        return new AiMemoryCandidate(
                "老师今晚不去外滩了",
                "short",
                "recent_event",
                "recent",
                "supersede",
                "明天晚上去外滩玩",
                null,
                0.9,
                0.8,
                "用户取消行程",
                new AiMemoryEvidence("user", "今晚去不了了"));
    }

    private static UserMemory activeShortMemory(Long id, String category, String content) {
        UserMemory memory = new UserMemory();
        memory.setId(id);
        memory.setUserId(1L);
        memory.setMemoryType("short");
        memory.setCategory(category);
        memory.setContent(content);
        memory.setStatus("active");
        memory.setLastReinforcedAt(LocalDateTime.now());
        return memory;
    }
}
