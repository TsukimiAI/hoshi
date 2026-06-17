package com.tsukimiai.hoshi.companion.ws;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import com.tsukimiai.hoshi.companion.metrics.CompanionWebSocketMetrics;
import com.tsukimiai.hoshi.companion.service.CompanionBroadcastService;

class HoshiWebSocketHandlerTest {

    private CompanionBroadcastService broadcastService;
    private CompanionWebSocketMetrics metrics;
    private HoshiWebSocketHandler handler;
    private WebSocketSession session;

    @BeforeEach
    void setUp() {
        broadcastService = mock(CompanionBroadcastService.class);
        metrics = mock(CompanionWebSocketMetrics.class);
        handler = new HoshiWebSocketHandler(broadcastService, metrics);
        session = mock(WebSocketSession.class);
    }

    @Test
    void connectionLifecycleRecordsMetrics() {
        handler.afterConnectionEstablished(session);
        handler.afterConnectionClosed(session, CloseStatus.NORMAL);

        verify(metrics).recordConnectionOpened("pet");
        verify(metrics).recordConnectionClosed("pet", "normal");
        verify(broadcastService).register(session);
        verify(broadcastService).unregister(session);
    }

    @Test
    void transportErrorRecordsMetricAndClosesSession() throws Exception {
        when(session.isOpen()).thenReturn(true);

        handler.handleTransportError(session, new RuntimeException("boom"));

        verify(metrics).recordTransportError("pet");
        verify(broadcastService).unregister(session);
        verify(session).close(CloseStatus.SERVER_ERROR);
    }
}
