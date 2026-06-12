package com.tsukimiai.hoshi.ai.config;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HoshiAiPropertiesTest {

    @Test
    void buildSystemPromptConcatenatesConfiguredSections() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setIdentity("你是星奈。");
        properties.setWorldview("拾星是桌面陪伴 App。");
        properties.setStyleGuide("用简洁中文回复。");

        AiFewShotExample example = new AiFewShotExample();
        example.setUser("你好");
        example.setAssistant("你好呀。");
        properties.setFewShots(List.of(example));

        String prompt = properties.buildSystemPrompt();

        assertThat(prompt).contains("【身份】");
        assertThat(prompt).contains("你是星奈。");
        assertThat(prompt).contains("【世界观】");
        assertThat(prompt).contains("拾星是桌面陪伴 App。");
        assertThat(prompt).contains("【回复方式】");
        assertThat(prompt).contains("用简洁中文回复。");
        assertThat(prompt).contains("【示例】");
        assertThat(prompt).contains("用户：你好");
        assertThat(prompt).contains("星奈：你好呀。");
    }

    @Test
    void buildSystemPromptSkipsBlankSections() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setIdentity("你是星奈。");
        properties.setWorldview("");
        properties.setStyleGuide("   ");
        properties.setFewShots(List.of());

        String prompt = properties.buildSystemPrompt();

        assertThat(prompt).isEqualTo("【身份】\n你是星奈。");
    }

    @Test
    void findFixedReplyMatchesContainsTrigger() {
        HoshiAiProperties properties = new HoshiAiProperties();
        AiFixedReply entry = new AiFixedReply();
        entry.setMatch("contains");
        entry.setTriggers(List.of("拾星是什么"));
        entry.setReply("拾星是桌面陪伴 App。");
        properties.setFixedReplies(List.of(entry));

        assertThat(properties.findFixedReply("请介绍一下，拾星是什么？")).isEqualTo("拾星是桌面陪伴 App。");
        assertThat(properties.findFixedReply("星奈你好")).isNull();
    }

    @Test
    void findFixedReplyMatchesExactTriggerOnly() {
        HoshiAiProperties properties = new HoshiAiProperties();
        AiFixedReply entry = new AiFixedReply();
        entry.setMatch("exact");
        entry.setTriggers(List.of("你好"));
        entry.setReply("你好呀。");
        properties.setFixedReplies(List.of(entry));

        assertThat(properties.findFixedReply("你好")).isEqualTo("你好呀。");
        assertThat(properties.findFixedReply("你好呀")).isNull();
    }

    @Test
    void findFixedReplyUsesFirstMatchInOrder() {
        HoshiAiProperties properties = new HoshiAiProperties();

        AiFixedReply first = new AiFixedReply();
        first.setTriggers(List.of("拾星"));
        first.setReply("第一条");

        AiFixedReply second = new AiFixedReply();
        second.setTriggers(List.of("拾星"));
        second.setReply("第二条");

        properties.setFixedReplies(List.of(first, second));

        assertThat(properties.findFixedReply("拾星是什么")).isEqualTo("第一条");
    }

    @Test
    void buildWebSearchExtraBodyUsesMaxWhenModelUnknown() {
        HoshiAiProperties properties = new HoshiAiProperties();

        assertThat(properties.buildWebSearchExtraBody())
                .containsEntry("enable_search", true)
                .containsEntry(
                        "search_options",
                        Map.of(
                                "search_strategy", "max",
                                "enable_search_extension", true));
    }

    @Test
    void buildWebSearchExtraBodyUsesAgentForQwen35PlusWithoutExtension() {
        HoshiAiProperties properties = new HoshiAiProperties();

        assertThat(properties.buildWebSearchExtraBody(true, "qwen3.5-plus"))
                .containsEntry(
                        "search_options",
                        Map.of(
                                "search_strategy", "agent",
                                "forced_search", true));
    }

    @Test
    void buildWebSearchExtraBodyForcesSearchWhenUserRequested() {
        HoshiAiProperties properties = new HoshiAiProperties();

        assertThat(properties.buildWebSearchExtraBody(true, "qwen-plus"))
                .containsEntry(
                        "search_options",
                        Map.of(
                                "search_strategy", "max",
                                "forced_search", true,
                                "enable_search_extension", true));
    }

    @Test
    void buildWebSearchExtraBodyIncludesForcedSearchWhenConfigured() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setWebSearchForced(true);

        assertThat(properties.buildWebSearchExtraBody(false, "qwen-plus"))
                .containsEntry("enable_search", true)
                .containsEntry(
                        "search_options",
                        Map.of(
                                "search_strategy", "max",
                                "forced_search", true,
                                "enable_search_extension", true));
    }

    @Test
    void resolveWebSearchStrategyHonorsExplicitConfig() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setWebSearchStrategy("turbo");

        assertThat(properties.resolveWebSearchStrategy("qwen3.5-plus")).isEqualTo("turbo");
    }

    @Test
    void buildSystemPromptAppendsWebSearchGuidanceAndExamplesWhenEnabled() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setIdentity("你是星奈。");
        properties.setWebSearchPrompt("请依据搜索结果回答。");
        AiFewShotExample example = new AiFewShotExample();
        example.setUser("今天上海天气怎么样");
        example.setAssistant("上海今天多云。");
        properties.setWebSearchFewShots(List.of(example));

        String prompt = properties.buildSystemPrompt(true);

        assertThat(prompt).contains("【联网模式】");
        assertThat(prompt).contains("请依据搜索结果回答。");
        assertThat(prompt).contains("【联网示例】");
        assertThat(prompt).contains("今天上海天气怎么样");
    }

    @Test
    void formatTitleUserPromptReplacesPlaceholders() {
        HoshiAiProperties properties = new HoshiAiProperties();

        String prompt = properties.formatTitleUserPrompt(" 今天好累 ", " 先休息吧 ");

        assertThat(prompt).contains("用户：今天好累");
        assertThat(prompt).contains("助手：先休息吧");
    }

    @Test
    void formatEmotionSystemPromptEmbedsCandidates() {
        HoshiAiProperties properties = new HoshiAiProperties();

        String prompt = properties.formatEmotionSystemPrompt("normal,happy,shy");

        assertThat(prompt).contains("情绪分类器");
        assertThat(prompt).contains("normal,happy,shy");
        assertThat(prompt).doesNotContain("{candidates}");
    }

    @Test
    void resolveEmotionModelPrefersConfiguredModel() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setEmotionModel("qwen-turbo");

        assertThat(properties.resolveEmotionModel("qwen3.5-plus")).isEqualTo("qwen-turbo");
    }

    @Test
    void resolveEmotionModelFallsBackToMainModelWhenUnset() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setEmotionModel("  ");

        assertThat(properties.resolveEmotionModel("qwen3.5-plus")).isEqualTo("qwen3.5-plus");
    }
}
