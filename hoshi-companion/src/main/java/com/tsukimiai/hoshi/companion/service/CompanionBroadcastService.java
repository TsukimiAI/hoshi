package com.tsukimiai.hoshi.companion.service;

import org.springframework.web.socket.WebSocketSession;

import com.tsukimiai.hoshi.companion.model.CompanionEmotion;
import com.tsukimiai.hoshi.companion.model.CompanionEventSource;
import com.tsukimiai.hoshi.companion.model.CompanionState;

public interface CompanionBroadcastService {

    void register(WebSocketSession session);

    void unregister(WebSocketSession session);

    CompanionState getCurrentState();

    void publishEmotion(String character, CompanionEmotion emotion, CompanionEventSource source, Long messageId, Integer segmentSeq);
}
