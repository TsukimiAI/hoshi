package com.tsukimiai.hoshi.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
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
import com.tsukimiai.hoshi.ai.model.AiKnowledgeChunk;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.ai.model.AiPromptBudget;
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
    @Mock
    private RetrievalOrchestrator retrievalOrchestrator;

    private ChatContextAssembler assembler;

    @BeforeEach
    void setUp() {
        assembler = new ChatContextAssembler(
                chatSessionService,
                persistenceService,
                memoryExtractionWorkflow,
                sessionSummaryCodec,
                hoshiAiProperties,
                retrievalOrchestrator);
        lenient().when(hoshiAiProperties.resolvePromptBudget()).thenReturn(
                new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400));
    }

    @Test
    void buildProactiveCognitionContextUsesRetrievalQueryAndReinforcesMemories() {
        ChatSession session = new ChatSession();
        session.setId(2L);
        session.setUserId(1L);
        List<ChatMessage> messages = List.of(message(1L, "user", "今晚去不了了"));
        when(sessionSummaryCodec.hydrateSessionSummary(session)).thenReturn(null);
        when(retrievalOrchestrator.retrieve(
                eq(1L),
                eq("外滩"),
                eq(List.of("今晚去不了了")),
                any(AiPromptBudget.class)))
                .thenReturn(new RetrievalBundle(
                        List.of(new AiMemoryContext("9", "外滩计划", "short", "plan", "recent", 0.9, 0.8, 0.8, false)),
                        List.of(),
                        List.of()));

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

    @Test
    void buildChatContextIncludesKnowledgeChunksFromRetrieval() {
        ChatSession session = new ChatSession();
        session.setId(3L);
        session.setUserId(1L);
        List<ChatMessage> messages = List.of(message(1L, "user", "帮我总结 Spring Boot 笔记"));
        when(sessionSummaryCodec.hydrateSessionSummary(session)).thenReturn(null);
        when(retrievalOrchestrator.retrieve(
                eq(1L),
                eq("帮我总结 Spring Boot 笔记"),
                eq(List.of()),
                any(AiPromptBudget.class)))
                .thenReturn(new RetrievalBundle(
                        List.of(),
                        List.of(),
                        List.of(new AiKnowledgeChunk("Spring Boot", "使用分层组织项目。", "kb:doc-1"))));

        var context = assembler.buildChatContext(1L, session, messages);

        assertThat(context.knowledgeChunks()).hasSize(1);
        assertThat(context.knowledgeChunks().get(0).title()).isEqualTo("Spring Boot");
    }

    @Test
    void collectPriorUserQueriesSkipsCurrentMessage() {
        List<AiChatTurn> turns = List.of(
                new AiChatTurn("user", "请总结我的面试知识梳理文档"),
                new AiChatTurn("assistant", "好的"),
                new AiChatTurn("user", "其中对于AI的笔记有没有错误"));

        List<String> contextQueries = assembler.collectPriorUserQueries(
                turns,
                "其中对于AI的笔记有没有错误",
                3);

        assertThat(contextQueries).containsExactly("请总结我的面试知识梳理文档");
    }

    private static ChatMessage message(Long id, String role, String content) {
        ChatMessage message = new ChatMessage();
        message.setId(id);
        message.setRole(role);
        message.setContent(content);
        return message;
    }
}
