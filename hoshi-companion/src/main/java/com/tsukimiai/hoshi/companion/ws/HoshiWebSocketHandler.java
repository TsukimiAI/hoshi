package com.tsukimiai.hoshi.companion.ws;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.tsukimiai.hoshi.companion.metrics.CompanionWebSocketMetrics;
import com.tsukimiai.hoshi.companion.service.CompanionBroadcastService;

@Component
public class HoshiWebSocketHandler extends TextWebSocketHandler {

    private static final String ENDPOINT = "pet";

    private final CompanionBroadcastService broadcastService;
    private final CompanionWebSocketMetrics metrics;

    public HoshiWebSocketHandler(
            CompanionBroadcastService broadcastService,
            CompanionWebSocketMetrics metrics) {
        this.broadcastService = broadcastService;
        this.metrics = metrics;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        metrics.recordConnectionOpened(ENDPOINT);
        broadcastService.register(session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // Heartbeat and client commands will be handled in later iterations.
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        broadcastService.unregister(session);
        metrics.recordConnectionClosed(ENDPOINT, closeCodeBucket(status));
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        metrics.recordTransportError(ENDPOINT);
        broadcastService.unregister(session);
        if (session.isOpen()) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    private String closeCodeBucket(CloseStatus status) {
        if (status == null) {
            return "other";
        }
        int code = status.getCode();
        if (code == CloseStatus.NORMAL.getCode()) {
            return "normal";
        }
        if (code == CloseStatus.GOING_AWAY.getCode()) {
            return "going_away";
        }
        if (code == CloseStatus.PROTOCOL_ERROR.getCode()) {
            return "protocol_error";
        }
        return "other";
    }
}
