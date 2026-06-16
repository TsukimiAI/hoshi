package com.tsukimiai.hoshi.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.ChatSessionTitles;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.stream.ChatStreamSink;
import com.tsukimiai.hoshi.user.entity.User;

@ExtendWith(MockitoExtension.class)
class SessionTitleWorkflowTest {

    @Mock
    private ChatSessionService chatSessionService;
    @Mock
    private ChatMessagePersistenceService persistenceService;
    @Mock
    private ChatSessionMapper chatSessionMapper;
    @Mock
    private XingnaiChatService xingnaiChatService;
    @Mock
    private ChatStreamSink sink;

    private SessionTitleWorkflow workflow;

    @BeforeEach
    void setUp() {
        PlatformTransactionManager transactionManager = new PlatformTransactionManager() {
            @Override
            public TransactionStatus getTransaction(TransactionDefinition definition) {
                return new SimpleTransactionStatus();
            }

            @Override
            public void commit(TransactionStatus status) {
            }

            @Override
            public void rollback(TransactionStatus status) {
            }
        };
        workflow = new SessionTitleWorkflow(
                chatSessionService,
                persistenceService,
                chatSessionMapper,
                xingnaiChatService,
                transactionManager);
    }

    @Test
    void skipsWhenSessionAlreadyHasCustomTitle() throws Exception {
        User user = user();
        ChatSession session = session("已有标题");
        when(chatSessionService.get(user, 1L)).thenReturn(session);

        workflow.maybeAutoTitle(user, 1L, sink);

        verify(xingnaiChatService, never()).suggestSessionTitle(any(), any());
        verify(sink, never()).emit(eq("session"), any());
    }

    @Test
    void suggestsTitleForFirstExchange() throws Exception {
        User user = user();
        ChatSession session = session(ChatSessionTitles.NEW_SESSION);
        ChatMessage userMessage = message("u1", "你好");
        ChatMessage assistantMessage = message("a1", "嗨");
        when(chatSessionService.get(user, 1L)).thenReturn(session);
        when(persistenceService.listRecentMessages(1L, Integer.MAX_VALUE))
                .thenReturn(List.of(userMessage, assistantMessage));
        when(xingnaiChatService.suggestSessionTitle("你好", "嗨")).thenReturn("问候");

        workflow.maybeAutoTitle(user, 1L, sink);

        verify(chatSessionMapper).updateById(any(ChatSession.class));
        verify(sink).emit(eq("session"), any());
    }

    private static User user() {
        User user = new User();
        user.setId(1L);
        user.setUsername("tester");
        return user;
    }

    private static ChatSession session(String title) {
        ChatSession session = new ChatSession();
        session.setId(1L);
        session.setTitle(title);
        return session;
    }

    private static ChatMessage message(String role, String content) {
        ChatMessage message = new ChatMessage();
        message.setRole(role);
        message.setContent(content);
        return message;
    }
}
