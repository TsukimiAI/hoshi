package com.tsukimiai.hoshi.companion.application;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.common.companion.CompanionEmotionPublishedEvent;
import com.tsukimiai.hoshi.companion.service.CompanionBroadcastService;

@Component
public class CompanionEmotionEventListener {

    private final CompanionBroadcastService companionBroadcastService;

    public CompanionEmotionEventListener(CompanionBroadcastService companionBroadcastService) {
        this.companionBroadcastService = companionBroadcastService;
    }

    @EventListener
    public void onCompanionEmotionPublished(CompanionEmotionPublishedEvent event) {
        companionBroadcastService.publishEmotion(
                event.character(),
                event.emotion(),
                event.source(),
                event.messageId(),
                event.segmentSeq());
    }
}
