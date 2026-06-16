package com.tsukimiai.hoshi.ai.cognition;

import java.util.List;

public record SessionCompactionResult(
        Integer summaryVersion,
        Long compressedUntilMessageId,
        String summaryText,
        List<String> facts,
        List<String> decisions,
        List<String> openLoops,
        List<String> staleItems) implements AiCognitionPayload {

    public SessionCompactionResult {
        facts = facts == null ? List.of() : List.copyOf(facts);
        decisions = decisions == null ? List.of() : List.copyOf(decisions);
        openLoops = openLoops == null ? List.of() : List.copyOf(openLoops);
        staleItems = staleItems == null ? List.of() : List.copyOf(staleItems);
    }
}
