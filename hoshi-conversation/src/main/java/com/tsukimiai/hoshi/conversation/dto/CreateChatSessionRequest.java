package com.tsukimiai.hoshi.conversation.dto;

import jakarta.validation.constraints.Size;

public record CreateChatSessionRequest(
        @Size(max = 128, message = "会话标题不能超过 128 个字符") String title) {
}
