package com.tsukimiai.hoshi.companion.model;

import java.time.LocalDateTime;

public record CompanionState(
        String character,
        CompanionEmotion emotion,
        CompanionEventSource source,
        Long messageId,
        Integer segmentSeq,
        LocalDateTime updatedAt) {

    public static final String DEFAULT_CHARACTER = "xingnai";

    public static CompanionState idle() {
        return new CompanionState(
                DEFAULT_CHARACTER,
                CompanionEmotion.NORMAL,
                CompanionEventSource.SYSTEM,
                null,
                null,
                LocalDateTime.now());
    }

    public CompanionState withEmotion(
            CompanionEmotion nextEmotion,
            CompanionEventSource nextSource,
            Long nextMessageId,
            Integer nextSegmentSeq) {
        return new CompanionState(character, nextEmotion, nextSource, nextMessageId, nextSegmentSeq, LocalDateTime.now());
    }
}
