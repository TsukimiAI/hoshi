package com.tsukimiai.hoshi.conversation.support;

import com.tsukimiai.hoshi.conversation.entity.UserMemory;

public record ScoredMemory(
        UserMemory memory,
        double score,
        double retention) {
}
