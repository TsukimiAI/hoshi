package com.tsukimiai.hoshi.conversation.support;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.tsukimiai.hoshi.conversation.entity.UserMemory;

import static org.assertj.core.api.Assertions.assertThat;

class MemoryContentMatcherTest {

    @Test
    void findMatchingMemoryMatchesSimilarLongTermPreference() {
        UserMemory existing = activeLongMemory("preference", "老师更喜欢后端开发");
        UserMemory matched = MemoryContentMatcher.findMatchingMemory(
                List.of(existing),
                "long",
                "preference",
                "老师偏好后端开发");

        assertThat(matched).isSameAs(existing);
    }

    @Test
    void findMatchingMemoryMatchesCrossCategoryWhenVerySimilar() {
        UserMemory existing = activeLongMemory("preference", "老师叫 Hanami");
        UserMemory matched = MemoryContentMatcher.findMatchingMemory(
                List.of(existing),
                "long",
                "identity",
                "老师叫Hanami");

        assertThat(matched).isSameAs(existing);
    }

    @Test
    void findMatchingMemoryReturnsNullForDifferentFacts() {
        UserMemory existing = activeLongMemory("preference", "老师更喜欢后端开发");
        UserMemory matched = MemoryContentMatcher.findMatchingMemory(
                List.of(existing),
                "long",
                "preference",
                "老师最近在学钢琴");

        assertThat(matched).isNull();
    }

    @Test
    void findBestMatchByHintMatchesStalePlan() {
        UserMemory plan = activeShortMemory("plan", "明天晚上去外滩玩");
        UserMemory matched = MemoryContentMatcher.findBestMatchByHint(
                List.of(plan),
                "明天晚上去外滩玩",
                MemoryContentMatcher.STALE_HINT_SIMILARITY_THRESHOLD);

        assertThat(matched).isSameAs(plan);
    }

    private static UserMemory activeShortMemory(String category, String content) {
        UserMemory memory = new UserMemory();
        memory.setId(2L);
        memory.setMemoryType("short");
        memory.setCategory(category);
        memory.setContent(content);
        memory.setStatus("active");
        return memory;
    }

    private static UserMemory activeLongMemory(String category, String content) {
        UserMemory memory = new UserMemory();
        memory.setId(1L);
        memory.setMemoryType("long");
        memory.setCategory(category);
        memory.setContent(content);
        memory.setStatus("active");
        return memory;
    }
}
