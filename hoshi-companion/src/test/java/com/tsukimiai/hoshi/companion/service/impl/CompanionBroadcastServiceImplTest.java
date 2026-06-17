package com.tsukimiai.hoshi.companion.service.impl;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import com.tsukimiai.hoshi.common.companion.CompanionEmotion;
import com.tsukimiai.hoshi.common.companion.CompanionEventSource;
import com.tsukimiai.hoshi.companion.metrics.CompanionWebSocketMetrics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CompanionBroadcastServiceImplTest {

    private CompanionBroadcastServiceImpl broadcastService;
    private CompanionWebSocketMetrics metrics;
    private WebSocketSession session;

    @BeforeEach
    void setUp() {
        metrics = mock(CompanionWebSocketMetrics.class);
        broadcastService = new CompanionBroadcastServiceImpl(metrics);
        session = mock(WebSocketSession.class);
        when(session.isOpen()).thenReturn(true);
    }

    @Test
    void registerSendsReadyPayload() throws Exception {
        broadcastService.register(session);

        verify(metrics).recordActiveConnections(1);
        verify(metrics).recordEventPublished("ready", "system");
        verify(metrics).recordMessageSent("ready");
        verify(session).sendMessage(any(TextMessage.class));
        TextMessage message = captureMessage(1);
        assertThat(message.getPayload())
                .contains("\"type\":\"ready\"")
                .contains("\"character\":\"xingnai\"")
                .contains("\"value\":\"normal\"");
    }

    @Test
    void publishEmotionBroadcastsStructuredPayload() throws Exception {
        broadcastService.register(session);

        broadcastService.publishEmotion("xingnai", CompanionEmotion.HAPPY, CompanionEventSource.CHAT, 42L, 2);

        verify(metrics).recordEventPublished("emotion", "chat");
        verify(metrics).recordMessageSent("emotion");
        verify(session, times(2)).sendMessage(any(TextMessage.class));
        TextMessage message = captureMessage(2);
        assertThat(message.getPayload())
                .contains("\"type\":\"emotion\"")
                .contains("\"character\":\"xingnai\"")
                .contains("\"value\":\"happy\"")
                .contains("\"source\":\"chat\"")
                .contains("\"messageId\":\"42\"")
                .contains("\"segmentSeq\":2");
        assertThat(broadcastService.getCurrentState().emotion()).isEqualTo(CompanionEmotion.HAPPY);
    }

    @Test
    void publishProactiveMessageBroadcastsStructuredPayload() throws Exception {
        broadcastService.register(session);

        broadcastService.publishProactiveMessage(
                "xingnai",
                12L,
                99L,
                "老师，面试准备得怎么样了？",
                "expect");

        verify(metrics).recordEventPublished("proactive_message", "system");
        verify(metrics).recordMessageSent("proactive_message");
        verify(session, times(2)).sendMessage(any(TextMessage.class));
        TextMessage message = captureMessage(2);
        assertThat(message.getPayload())
                .contains("\"type\":\"proactive_message\"")
                .contains("\"sessionId\":\"12\"")
                .contains("\"messageId\":\"99\"")
                .contains("面试准备");
    }

    @Test
    void closedSessionRecordsSendErrorAndRemovesConnection() {
        when(session.isOpen()).thenReturn(false);

        broadcastService.register(session);

        verify(metrics, never()).recordMessageSent("ready");
        verify(metrics).recordMessageSendError("closed");
        verify(metrics).recordActiveConnections(1);
        verify(metrics).recordActiveConnections(0);
    }

    @Test
    void ioFailureRecordsSendErrorAndClosesSession() throws Exception {
        doThrow(new java.io.IOException("boom")).when(session).sendMessage(any(TextMessage.class));

        broadcastService.register(session);

        verify(metrics).recordMessageSendError("io_error");
        verify(session).close();
        verify(metrics).recordActiveConnections(0);
    }

    private TextMessage captureMessage(int invocation) throws Exception {
        org.mockito.ArgumentCaptor<TextMessage> captor = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        verify(session, times(invocation)).sendMessage(captor.capture());
        return captor.getAllValues().get(invocation - 1);
    }
}
