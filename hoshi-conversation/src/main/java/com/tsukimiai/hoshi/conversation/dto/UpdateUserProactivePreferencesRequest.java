package com.tsukimiai.hoshi.conversation.dto;

public record UpdateUserProactivePreferencesRequest(
        Boolean enabled,
        Boolean followUpEnabled) {
}
