package com.tsukimiai.hoshi.conversation.dto;

public record UserProactivePreferencesResponse(
        boolean enabled,
        boolean followUpEnabled) {
}
