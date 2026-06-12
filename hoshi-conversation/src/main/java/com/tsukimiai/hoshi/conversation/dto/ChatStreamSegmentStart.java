package com.tsukimiai.hoshi.conversation.dto;

public record ChatStreamSegmentStart(
        int seq,
        String emotion,
        int contentLength) {
}
