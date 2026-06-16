package com.tsukimiai.hoshi.conversation.dto;

import jakarta.validation.constraints.Size;

public record UpdateUserMemoryRequest(
        @Size(max = 500, message = "记忆内容不能超过 500 个字符")
        String content,
        @Size(max = 64, message = "记忆分类无效")
        String category,
        Boolean alwaysPinned) {
}
