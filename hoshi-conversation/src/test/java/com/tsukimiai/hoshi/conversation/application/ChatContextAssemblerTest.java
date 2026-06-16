package com.tsukimiai.hoshi.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;

@ExtendWith(MockitoExtension.class)
class ChatContextAssemblerTest {

    @Mock
    private ChatSessionService chatSessionService;
    @Mock
    private ChatMessagePersistenceService persistenceService;
    @Mock
    private MemoryExtractionWorkflow memoryExtractionWorkflow;
    @Mock
    private SessionSummaryCodec sessionSummaryCodec;
    @Mock
    private HoshiAiProperties hoshiAiProperties;

    private ChatContextAssembler assembler;

    @BeforeEach
    void setUp() {
        assembler = new ChatContextAssembler(
                chatSessionService,
                persistenceService,
                memoryExtractionWorkflow,
                sessionSummaryCodec,
                hoshiAiProperties);
        when(hoshiAiProperties.resolvePromptBudget()).thenReturn(
                new com.tsukimiai.hoshi.ai.model.AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400));
    }

    @Test
    void buildProactiveCognitionContextUsesRetrievalQueryAndReinforcesMemories() {
        ChatSession session = new ChatSession();
        session.setId(2L);
        session.setUserId(1L);
        List<ChatMessage> messages = List.of(message(1L, "user", "今晚去不了了"));
        when(sessionSummaryCodec.hydrateSessionSummary(session)).thenReturn(null);
        when(memoryExtractionWorkflow.selectShortMemories(eq(1L), eq("外滩"), eq(1200)))
                .thenReturn(List.of(new AiMemoryContext("9", "外滩计划", "short", "plan", "recent", 0.9, 0.8, 0.8, false)));
        when(memoryExtractionWorkflow.selectLongMemories(eq(1L), eq("外滩"), eq(1200)))
                .thenReturn(List.of());

        AiCognitionInput input = assembler.buildProactiveCognitionContext(
                1L,
                session,
                messages,
                "外滩",
                Map.of("hint", "外滩"));

        assertThat(input.metadata()).containsKey("chatContext");
        assertThat(input.recentTurns()).extracting(AiChatTurn::content).contains("今晚去不了了");
        verify(memoryExtractionWorkflow).reinforceRetrievedMemories(any(), any());
    }

    private static ChatMessage message(Long id, String role, String content) {
        ChatMessage message = new ChatMessage();
        message.setId(id);
        message.setRole(role);
        message.setContent(content);
        return message;
    }
}
