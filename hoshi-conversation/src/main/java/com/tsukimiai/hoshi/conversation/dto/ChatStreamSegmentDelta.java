package com.tsukimiai.hoshi.conversation.dto;

public record ChatStreamSegmentDelta(
        int seq,
        String content) {
}
