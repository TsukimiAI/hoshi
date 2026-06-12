package com.tsukimiai.hoshi.companion.ws;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.tsukimiai.hoshi.companion.service.CompanionBroadcastService;

@Component
public class HoshiWebSocketHandler extends TextWebSocketHandler {

    private final CompanionBroadcastService broadcastService;

    public HoshiWebSocketHandler(CompanionBroadcastService broadcastService) {
        this.broadcastService = broadcastService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        broadcastService.register(session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // Heartbeat and client commands will be handled in later iterations.
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        broadcastService.unregister(session);
    }

}
