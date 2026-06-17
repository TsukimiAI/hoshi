package com.tsukimiai.hoshi.companion.service.impl;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.tsukimiai.hoshi.common.companion.CompanionEmotion;
import com.tsukimiai.hoshi.common.companion.CompanionEventSource;
import com.tsukimiai.hoshi.common.companion.CompanionState;
import com.tsukimiai.hoshi.companion.metrics.CompanionWebSocketMetrics;
import com.tsukimiai.hoshi.companion.service.CompanionBroadcastService;
import com.tsukimiai.hoshi.companion.ws.CompanionEventMessage;

@Primary
@Service
public class CompanionBroadcastServiceImpl implements CompanionBroadcastService {

    private static final Logger log = LoggerFactory.getLogger(CompanionBroadcastServiceImpl.class);

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();
    private final AtomicReference<CompanionState> currentState = new AtomicReference<>(CompanionState.idle());
    private final CompanionWebSocketMetrics metrics;

    public CompanionBroadcastServiceImpl(CompanionWebSocketMetrics metrics) {
        this.metrics = metrics;
    }

    @Override
    public void register(WebSocketSession session) {
        sessions.add(session);
        metrics.recordActiveConnections(sessions.size());
        metrics.recordEventPublished("ready", currentState.get().source().getValue());
        send(session, CompanionEventMessage.ready(currentState.get()));
    }

    @Override
    public void unregister(WebSocketSession session) {
        sessions.remove(session);
        metrics.recordActiveConnections(sessions.size());
    }

    @Override
    public CompanionState getCurrentState() {
        return currentState.get();
    }

    @Override
    public void publishEmotion(
            String character,
            CompanionEmotion emotion,
            CompanionEventSource source,
            Long messageId,
            Integer segmentSeq) {
        CompanionState nextState = new CompanionState(
                character,
                emotion,
                source,
                messageId,
                segmentSeq,
                LocalDateTime.now());
        currentState.set(nextState);
        metrics.recordEventPublished("emotion", source == null ? "unknown" : source.getValue());
        broadcast(CompanionEventMessage.emotion(nextState));
    }

    @Override
    public void publishProactiveMessage(
            String character,
            Long sessionId,
            Long messageId,
            String content,
            String emotion) {
        metrics.recordEventPublished("proactive_message", CompanionEventSource.SYSTEM.getValue());
        broadcast(CompanionEventMessage.proactiveMessage(character, sessionId, messageId, content, emotion));
    }

    private void broadcast(CompanionEventMessage message) {
        for (WebSocketSession session : sessions) {
            send(session, message);
        }
    }

    private void send(WebSocketSession session, CompanionEventMessage message) {
        if (!session.isOpen()) {
            sessions.remove(session);
            metrics.recordActiveConnections(sessions.size());
            metrics.recordMessageSendError("closed");
            return;
        }
        try {
            session.sendMessage(new TextMessage(serialize(message)));
            metrics.recordMessageSent(message.type());
        } catch (JsonProcessingException ex) {
            log.warn("Failed to serialize companion websocket message", ex);
            metrics.recordMessageSendError("serialize_error");
        } catch (IOException ex) {
            log.debug("Failed to send companion websocket message", ex);
            sessions.remove(session);
            metrics.recordActiveConnections(sessions.size());
            metrics.recordMessageSendError("io_error");
            try {
                session.close();
            } catch (IOException ignored) {
                // Ignore close failure after send failure.
            }
        }
    }

    private String serialize(CompanionEventMessage message) throws JsonProcessingException {
        return objectMapper.writeValueAsString(message);
    }
}
