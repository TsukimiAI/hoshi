package com.tsukimiai.hoshi.companion.ws;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.tsukimiai.hoshi.companion.model.CompanionEventSource;
import com.tsukimiai.hoshi.companion.model.CompanionState;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CompanionEventMessage(
        String type,
        String character,
        String value,
        String source,
        String messageId,
        Integer segmentSeq,
        String timestamp) {

    public static CompanionEventMessage ready(CompanionState state) {
        return new CompanionEventMessage(
                "ready",
                state.character(),
                state.emotion().getValue(),
                state.source().getValue(),
                state.messageId() == null ? null : String.valueOf(state.messageId()),
                state.segmentSeq(),
                state.updatedAt().toString());
    }

    public static CompanionEventMessage emotion(CompanionState state) {
        return new CompanionEventMessage(
                "emotion",
                state.character(),
                state.emotion().getValue(),
                state.source().getValue(),
                state.messageId() == null ? null : String.valueOf(state.messageId()),
                state.segmentSeq(),
                state.updatedAt().toString());
    }

    public static CompanionEventMessage emotion(
            String character,
            String value,
            CompanionEventSource source,
            Long messageId,
            Integer segmentSeq,
            LocalDateTime timestamp) {
        return new CompanionEventMessage(
                "emotion",
                character,
                value,
                source.getValue(),
                messageId == null ? null : String.valueOf(messageId),
                segmentSeq,
                timestamp == null ? null : timestamp.toString());
    }
}
