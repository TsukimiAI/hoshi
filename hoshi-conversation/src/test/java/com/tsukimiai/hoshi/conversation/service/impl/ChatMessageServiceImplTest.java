package com.tsukimiai.hoshi.conversation.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.PlatformTransactionManager;

import com.tsukimiai.hoshi.conversation.application.ChatMessagePersistenceService;
import com.tsukimiai.hoshi.conversation.application.ChatStreamErrorHandler;
import com.tsukimiai.hoshi.conversation.application.ChatStreamOrchestrator;
import com.tsukimiai.hoshi.conversation.application.proactive.ProactiveReplyTracker;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamPlaybackSettings;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageRole;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.stream.ChatStreamSink;
import com.tsukimiai.hoshi.user.entity.User;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@ExtendWith(MockitoExtension.class)
class ChatMessageServiceImplTest {

    @Mock
    private ChatMessagePersistenceService persistenceService;
    @Mock
    private ChatStreamOrchestrator streamOrchestrator;
    @Mock
    private ChatSessionService chatSessionService;
    @Mock
    private ProactiveReplyTracker proactiveReplyTracker;
    @Mock
    private PlatformTransactionManager transactionManager;

    private final ChatStreamErrorHandler streamErrorHandler = new ChatStreamErrorHandler();
    private final SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();

    private ChatMessageServiceImpl service;
    private ChatStreamSink sink;
    private User user;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        ObjectProvider<io.micrometer.core.instrument.MeterRegistry> meterRegistryProvider = mock(ObjectProvider.class);
        when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
        service = new ChatMessageServiceImpl(
                persistenceService,
                streamOrchestrator,
                streamErrorHandler,
                chatSessionService,
                proactiveReplyTracker,
                transactionManager,
                meterRegistryProvider);
        sink = mock(ChatStreamSink.class);
        user = new User();
        user.setId(1L);
    }

    @Test
    void retryStreamRecordsSuccessMetrics() {
        ChatMessage lastUserMessage = new ChatMessage();
        lastUserMessage.setRole(ChatMessageRole.USER.getValue());
        when(persistenceService.listRecentMessages(42L, Integer.MAX_VALUE)).thenReturn(List.of(lastUserMessage));
        doNothing().when(streamOrchestrator)
                .streamAssistantReply(user, 42L, sink, "retry", false, false, ChatStreamPlaybackSettings.empty());

        service.retryStream(user, 42L, ChatStreamPlaybackSettings.empty(), sink);

        assertThat(meterRegistry.get("hoshi.chat.stream.requests.total")
                .tag("operation", "retry")
                .tag("web_search", "false")
                .counter()
                .count()).isEqualTo(1.0d);
        assertThat(meterRegistry.get("hoshi.chat.stream.duration")
                .tag("operation", "retry")
                .tag("web_search", "false")
                .tag("outcome", "success")
                .timer()
                .count()).isEqualTo(1L);
    }

    @Test
    void retryStreamRecordsBusinessErrorMetrics() {
        when(persistenceService.listRecentMessages(42L, Integer.MAX_VALUE)).thenReturn(List.of());

        service.retryStream(user, 42L, ChatStreamPlaybackSettings.empty(), sink);

        assertThat(meterRegistry.get("hoshi.chat.stream.duration")
                .tag("operation", "retry")
                .tag("web_search", "false")
                .tag("outcome", "error")
                .timer()
                .count()).isEqualTo(1L);
        assertThat(meterRegistry.get("hoshi.chat.stream.errors.total")
                .tag("operation", "retry")
                .tag("error_code", "40000")
                .counter()
                .count()).isEqualTo(1.0d);
    }
}
