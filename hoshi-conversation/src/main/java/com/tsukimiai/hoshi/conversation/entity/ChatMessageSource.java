package com.tsukimiai.hoshi.conversation.entity;

public enum ChatMessageSource {

    CHAT("chat"),
    PROACTIVE_MEMORY("proactive_memory"),
    PROACTIVE_OPEN_LOOP("proactive_open_loop"),
    PROACTIVE_FOLLOW_UP_CONTINUE("proactive_follow_up_continue"),
    PROACTIVE_FOLLOW_UP_NEW_TOPIC("proactive_follow_up_new_topic"),
    FOLLOW_UP_CONTINUE("follow_up_continue"),
    FOLLOW_UP_NEW_TOPIC("follow_up_new_topic");

    private final String value;

    ChatMessageSource(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }
}
