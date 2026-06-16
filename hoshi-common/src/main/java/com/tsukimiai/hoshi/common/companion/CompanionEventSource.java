package com.tsukimiai.hoshi.common.companion;

public enum CompanionEventSource {

    SYSTEM("system"),
    CHAT("chat");

    private final String value;

    CompanionEventSource(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
