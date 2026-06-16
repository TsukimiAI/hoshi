package com.tsukimiai.hoshi.conversation.entity;

public enum ProactiveSourceType {

    MEMORY("memory"),
    OPEN_LOOP("open_loop");

    private final String value;

    ProactiveSourceType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
