package com.tsukimiai.hoshi.conversation.dto;

public record ChatStreamSegmentDone(
        int seq,
        String content,
        String emotion) {
}
