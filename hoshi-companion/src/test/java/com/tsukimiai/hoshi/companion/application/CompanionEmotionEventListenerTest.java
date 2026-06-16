package com.tsukimiai.hoshi.companion.application;

import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.common.companion.CompanionEmotion;
import com.tsukimiai.hoshi.common.companion.CompanionEmotionPublishedEvent;
import com.tsukimiai.hoshi.common.companion.CompanionEventSource;
import com.tsukimiai.hoshi.common.companion.CompanionState;
import com.tsukimiai.hoshi.companion.service.CompanionBroadcastService;

@ExtendWith(MockitoExtension.class)
class CompanionEmotionEventListenerTest {

    @Mock
    private CompanionBroadcastService companionBroadcastService;

    @InjectMocks
    private CompanionEmotionEventListener listener;

    @Test
    void forwardsPublishedEventToBroadcastService() {
        listener.onCompanionEmotionPublished(new CompanionEmotionPublishedEvent(
                CompanionState.DEFAULT_CHARACTER,
                CompanionEmotion.HAPPY,
                CompanionEventSource.CHAT,
                42L,
                2));

        verify(companionBroadcastService).publishEmotion(
                CompanionState.DEFAULT_CHARACTER,
                CompanionEmotion.HAPPY,
                CompanionEventSource.CHAT,
                42L,
                2);
    }
}
