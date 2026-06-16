package com.tsukimiai.hoshi.conversation.application;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.common.companion.CompanionMessagePublishedEvent;
import com.tsukimiai.hoshi.common.companion.CompanionState;

@Component
public class CompanionMessagePublisher {

    private final ApplicationEventPublisher eventPublisher;

    public CompanionMessagePublisher(ApplicationEventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }

    public void publish(Long sessionId, Long messageId, String content, String emotion) {
        eventPublisher.publishEvent(new CompanionMessagePublishedEvent(
                CompanionState.DEFAULT_CHARACTER,
                sessionId,
                messageId,
                content,
                emotion));
    }
}
