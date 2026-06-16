package com.tsukimiai.hoshi.ai.model;

import java.util.List;

public record AiSessionSummary(
        Integer version,
        Long compressedUntilMessageId,
        String summaryText,
        List<String> facts,
        List<String> decisions,
        List<String> openLoops) {

    public AiSessionSummary {
        facts = facts == null ? List.of() : List.copyOf(facts);
        decisions = decisions == null ? List.of() : List.copyOf(decisions);
        openLoops = openLoops == null ? List.of() : List.copyOf(openLoops);
    }

    public boolean hasContent() {
        return (summaryText != null && !summaryText.isBlank())
                || !facts.isEmpty()
                || !decisions.isEmpty()
                || !openLoops.isEmpty();
    }
}
