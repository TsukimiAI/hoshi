package com.tsukimiai.hoshi.companion.service;

import org.springframework.web.socket.WebSocketSession;

import com.tsukimiai.hoshi.common.companion.CompanionEmotion;
import com.tsukimiai.hoshi.common.companion.CompanionEventSource;
import com.tsukimiai.hoshi.common.companion.CompanionState;

public interface CompanionBroadcastService {

    void register(WebSocketSession session);

    void unregister(WebSocketSession session);

    CompanionState getCurrentState();

    void publishEmotion(String character, CompanionEmotion emotion, CompanionEventSource source, Long messageId, Integer segmentSeq);

    void publishProactiveMessage(String character, Long sessionId, Long messageId, String content, String emotion);
}
