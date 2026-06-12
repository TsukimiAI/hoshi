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
import com.tsukimiai.hoshi.companion.model.CompanionEmotion;
import com.tsukimiai.hoshi.companion.model.CompanionEventSource;
import com.tsukimiai.hoshi.companion.model.CompanionState;
import com.tsukimiai.hoshi.companion.service.CompanionBroadcastService;
import com.tsukimiai.hoshi.companion.ws.CompanionEventMessage;

@Primary
@Service
public class CompanionBroadcastServiceImpl implements CompanionBroadcastService {

    private static final Logger log = LoggerFactory.getLogger(CompanionBroadcastServiceImpl.class);

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();
    private final AtomicReference<CompanionState> currentState = new AtomicReference<>(CompanionState.idle());

    @Override
    public void register(WebSocketSession session) {
        sessions.add(session);
        send(session, CompanionEventMessage.ready(currentState.get()));
    }

    @Override
    public void unregister(WebSocketSession session) {
        sessions.remove(session);
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
        broadcast(CompanionEventMessage.emotion(nextState));
    }

    private void broadcast(CompanionEventMessage message) {
        for (WebSocketSession session : sessions) {
            send(session, message);
        }
    }

    private void send(WebSocketSession session, CompanionEventMessage message) {
        if (!session.isOpen()) {
            sessions.remove(session);
            return;
        }
        try {
            session.sendMessage(new TextMessage(serialize(message)));
        } catch (IOException ex) {
            log.debug("Failed to send companion websocket message", ex);
            sessions.remove(session);
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
