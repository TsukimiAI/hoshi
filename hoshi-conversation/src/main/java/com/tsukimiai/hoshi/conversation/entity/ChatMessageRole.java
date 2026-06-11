package com.tsukimiai.hoshi.conversation.entity;

public enum ChatMessageRole {

    USER("user"),
    ASSISTANT("assistant");

    private final String value;

    ChatMessageRole(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static ChatMessageRole fromValue(String value) {
        for (ChatMessageRole role : values()) {
            if (role.value.equalsIgnoreCase(value)) {
                return role;
            }
        }
        throw new IllegalArgumentException("Unknown chat message role: " + value);
    }
}
