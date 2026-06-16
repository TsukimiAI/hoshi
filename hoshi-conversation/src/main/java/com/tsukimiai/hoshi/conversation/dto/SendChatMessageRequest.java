package com.tsukimiai.hoshi.conversation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendChatMessageRequest(
        @NotBlank(message = "消息内容不能为空")
        @Size(max = 8000, message = "消息内容过长")
        String content,
        Boolean webSearch,
        Integer sentencePlaybackCharDelayMs,
        Integer sentenceGapDelayMs) {

    public boolean webSearchEnabled() {
        return Boolean.TRUE.equals(webSearch);
    }

    public ChatStreamPlaybackSettings playbackSettings() {
        return new ChatStreamPlaybackSettings(sentencePlaybackCharDelayMs, sentenceGapDelayMs);
    }
}
