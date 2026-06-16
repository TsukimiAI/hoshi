package com.tsukimiai.hoshi.conversation.dto;

import java.time.LocalDateTime;

import com.tsukimiai.hoshi.conversation.entity.ProactiveConversationLog;

public record ProactiveHistoryResponse(
        String id,
        String sourceType,
        String sourceKey,
        String content,
        LocalDateTime createdAt) {

    public static ProactiveHistoryResponse from(ProactiveConversationLog log) {
        return new ProactiveHistoryResponse(
                String.valueOf(log.getId()),
                log.getSourceType(),
                log.getSourceKey(),
                log.getContent(),
                log.getCreatedAt());
    }
}
