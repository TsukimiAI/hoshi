package com.tsukimiai.hoshi.companion.model;

public record CompanionState(
        CompanionEmotion emotion,
        String spriteKey,
        String message) {

    public static CompanionState idle() {
        return new CompanionState(CompanionEmotion.IDLE, "idle", "我在这里");
    }

}
