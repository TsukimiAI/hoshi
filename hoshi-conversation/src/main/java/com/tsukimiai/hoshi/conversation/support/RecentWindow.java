package com.tsukimiai.hoshi.conversation.support;

import java.util.List;

import com.tsukimiai.hoshi.ai.model.AiChatTurn;

public record RecentWindow(
        List<AiChatTurn> turns,
        Long firstMessageId,
        int usedTokens) {
}
