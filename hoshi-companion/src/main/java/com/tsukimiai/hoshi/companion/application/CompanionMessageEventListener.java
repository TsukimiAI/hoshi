package com.tsukimiai.hoshi.companion.application;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.common.companion.CompanionMessagePublishedEvent;
import com.tsukimiai.hoshi.companion.service.CompanionBroadcastService;

@Component
public class CompanionMessageEventListener {

    private final CompanionBroadcastService companionBroadcastService;

    public CompanionMessageEventListener(CompanionBroadcastService companionBroadcastService) {
        this.companionBroadcastService = companionBroadcastService;
    }

    @EventListener
    public void onCompanionMessagePublished(CompanionMessagePublishedEvent event) {
        companionBroadcastService.publishProactiveMessage(
                event.character(),
                event.sessionId(),
                event.messageId(),
                event.content(),
                event.emotion());
    }
}
