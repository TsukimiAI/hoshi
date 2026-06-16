package com.tsukimiai.hoshi.ai.cognition;

import java.util.List;
import java.util.Map;

import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.model.AiSessionSummary;

public record AiCognitionInput(
        List<AiChatTurn> recentTurns,
        AiSessionSummary sessionSummary,
        Map<String, Object> metadata) {

    public AiCognitionInput {
        recentTurns = recentTurns == null ? List.of() : List.copyOf(recentTurns);
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }
}
