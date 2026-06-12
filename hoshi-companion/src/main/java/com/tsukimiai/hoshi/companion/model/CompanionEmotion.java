package com.tsukimiai.hoshi.companion.model;

import java.util.Arrays;
import java.util.List;

public enum CompanionEmotion {

    NORMAL("normal"),
    HAPPY("happy"),
    SHY("shy"),
    CONFUSED("confused"),
    ANGRY("angry"),
    DISDAIN("disdain"),
    DOUBT("doubt"),
    EXPECT("expect"),
    LIKE("like"),
    RESENTMENT("resentment"),
    RESIST("resist"),
    SAD("sad"),
    SHOCK("shock"),
    SHY_AND_INDIGNATION("shy-and-indignation"),
    VERY_HAPPY("very-happy"),
    VERY_LIKE("very-like"),
    WRY("wry"),
    YANDERE("yandere");

    private final String value;

    CompanionEmotion(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static CompanionEmotion fromValue(String raw) {
        if (raw == null || raw.isBlank()) {
            return NORMAL;
        }
        return Arrays.stream(values())
                .filter(item -> item.value.equalsIgnoreCase(raw.trim()))
                .findFirst()
                .orElse(NORMAL);
    }

    public static List<String> protocolValues() {
        return Arrays.stream(values())
                .map(CompanionEmotion::getValue)
                .toList();
    }
}
