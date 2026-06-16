package com.tsukimiai.hoshi.conversation.application.proactive;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
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
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.ai.model.AiPromptBudget;
import com.tsukimiai.hoshi.conversation.application.ChatContextAssembler;
import com.tsukimiai.hoshi.conversation.application.ChatMessagePersistenceService;
import com.tsukimiai.hoshi.conversation.application.SessionSummaryCodec;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.entity.ProactiveSourceType;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.mapper.UserMemoryMapper;

@ExtendWith(MockitoExtension.class)
class ProactiveCandidateSelectorTest {

    @Mock
    private UserMemoryMapper userMemoryMapper;
    @Mock
    private ChatSessionMapper chatSessionMapper;
    @Mock
    private ChatMessageMapper chatMessageMapper;
    @Mock
    private SessionSummaryCodec sessionSummaryCodec;
    @Mock
    private ChatContextAssembler chatContextAssembler;
    @Mock
    private ChatMessagePersistenceService persistenceService;

    private ProactiveCandidateSelector selector;

    @BeforeEach
    void setUp() {
        selector = new ProactiveCandidateSelector(
                userMemoryMapper,
                chatSessionMapper,
                chatMessageMapper,
                sessionSummaryCodec,
                chatContextAssembler,
                persistenceService);
    }

    @Test
    void selectCandidatesUsesRagShortMemoriesInsteadOfDbTopEight() {
        ChatSession session = new ChatSession();
        session.setId(42L);
        session.setUserId(1L);
        when(chatSessionMapper.selectList(any())).thenReturn(List.of(session));
        when(persistenceService.listRecentMessages(42L, Integer.MAX_VALUE)).thenReturn(List.of());
        when(sessionSummaryCodec.hydrateSessionSummary(session)).thenReturn(null);
        when(chatContextAssembler.buildChatContext(eq(1L), eq(session), any())).thenReturn(new AiChatContext(
                List.of(new AiChatTurn("user", "今晚去不了了")),
                null,
                List.of(new AiMemoryContext(
                        "9",
                        "老师今晚不去外滩了",
                        "short",
                        "recent_event",
                        "recent",
                        0.9,
                        0.8,
                        0.8,
                        false)),
                List.of(),
                List.of(),
                new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400)));

        List<ProactiveCandidate> candidates = selector.selectCandidates(1L);

        assertThat(candidates).hasSize(1);
        assertThat(candidates.get(0).sourceType()).isEqualTo(ProactiveSourceType.MEMORY);
        assertThat(candidates.get(0).hint()).isEqualTo("老师今晚不去外滩了");
        assertThat(candidates.get(0).sourceKey()).isEqualTo("memory:9");
        verify(chatContextAssembler).buildChatContext(eq(1L), eq(session), any());
        verifyNoInteractions(userMemoryMapper);
    }
}
