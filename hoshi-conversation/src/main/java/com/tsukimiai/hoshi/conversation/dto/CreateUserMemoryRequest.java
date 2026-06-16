package com.tsukimiai.hoshi.conversation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserMemoryRequest(
        @NotBlank(message = "记忆内容不能为空")
        @Size(max = 500, message = "记忆内容不能超过 500 个字符")
        String content,
        @NotBlank(message = "记忆分类不能为空")
        @Size(max = 64, message = "记忆分类无效")
        String category,
        Boolean alwaysPinned) {
}
