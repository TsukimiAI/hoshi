package com.tsukimiai.hoshi.companion.service.impl;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import com.tsukimiai.hoshi.companion.model.CompanionEmotion;
import com.tsukimiai.hoshi.companion.model.CompanionEventSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CompanionBroadcastServiceImplTest {

    private CompanionBroadcastServiceImpl broadcastService;
    private WebSocketSession session;

    @BeforeEach
    void setUp() {
        broadcastService = new CompanionBroadcastServiceImpl();
        session = mock(WebSocketSession.class);
        when(session.isOpen()).thenReturn(true);
    }

    @Test
    void registerSendsReadyPayload() throws Exception {
        broadcastService.register(session);

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

    private TextMessage captureMessage(int invocation) throws Exception {
        org.mockito.ArgumentCaptor<TextMessage> captor = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        verify(session, times(invocation)).sendMessage(captor.capture());
        return captor.getAllValues().get(invocation - 1);
    }
}
