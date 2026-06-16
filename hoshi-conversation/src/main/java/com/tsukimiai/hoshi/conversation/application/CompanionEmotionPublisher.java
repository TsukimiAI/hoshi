package com.tsukimiai.hoshi.conversation.application;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.common.companion.CompanionEmotion;
import com.tsukimiai.hoshi.common.companion.CompanionEmotionPublishedEvent;
import com.tsukimiai.hoshi.common.companion.CompanionEventSource;
import com.tsukimiai.hoshi.common.companion.CompanionState;

@Component
public class CompanionEmotionPublisher {

    private final ApplicationEventPublisher eventPublisher;

    public CompanionEmotionPublisher(ApplicationEventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }

    public void publish(
            CompanionEmotion emotion,
            CompanionEventSource source,
            Long messageId,
            Integer segmentSeq) {
        eventPublisher.publishEvent(new CompanionEmotionPublishedEvent(
                CompanionState.DEFAULT_CHARACTER,
                emotion,
                source,
                messageId,
                segmentSeq));
    }
}
