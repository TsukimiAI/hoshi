package com.tsukimiai.hoshi.ai.config;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.model.AiChatContext;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.model.AiKnowledgeChunk;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.ai.model.AiPromptBudget;
import com.tsukimiai.hoshi.ai.model.AiSessionSummary;

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
    void buildSystemPromptAppendsSessionSummaryMemoriesAndKnowledge() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setIdentity("你是星奈。");

        String prompt = properties.buildSystemPrompt(false, new AiChatContext(
                List.of(),
                new AiSessionSummary(1, 12L, "聊过面试准备。", List.of("老师最近在准备面试"), List.of("先整理项目经历"), List.of("还要补自我介绍")),
                List.of(new AiMemoryContext("1", "老师最近在准备 Java 面试", "short", "temporary_goal", "recent", 0.9, 0.8, 0.7, false)),
                List.of(new AiMemoryContext("2", "老师更喜欢后端开发", "long", "preference", "stable", 0.9, 0.9, 1.0, true)),
                List.of(new AiKnowledgeChunk("Spring Boot", "可以用分层方式组织项目。", "doc-1")),
                new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400)));

        assertThat(prompt).contains("【本会话摘要】");
        assertThat(prompt).contains("【老师最近的情况】");
        assertThat(prompt).contains("【关于老师的长期记忆】");
        assertThat(prompt).contains("【参考资料】");
        assertThat(prompt).contains("老师更喜欢后端开发");
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

    @Test
    void defaultMemoryExtractionSettingsUseRecentMessagesAndSessionSummary() {
        HoshiAiProperties properties = new HoshiAiProperties();

        assertThat(properties.getMemoryExtractionMessageLimit()).isEqualTo(4);
        assertThat(properties.isMemoryExtractionIncludeSessionSummary()).isTrue();
    }

    @Test
    void formatMemoryExtractionUserPromptIncludesSessionSummaryAndRecentTurns() {
        HoshiAiProperties properties = new HoshiAiProperties();

        String prompt = properties.formatMemoryExtractionUserPrompt(new AiCognitionInput(
                List.of(new AiChatTurn("user", "你好")),
                new AiSessionSummary(1, 5L, "聊过面试准备。", List.of("老师最近在准备面试"), List.of(), List.of()),
                Map.of()));

        assertThat(prompt).contains("【本会话摘要】");
        assertThat(prompt).contains("聊过面试准备。");
        assertThat(prompt).contains("【近期对话】");
        assertThat(prompt).contains("[user] 你好");
    }

    @Test
    void formatMemoryExtractionUserPromptSkipsSessionSummaryWhenDisabled() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setMemoryExtractionIncludeSessionSummary(false);

        String prompt = properties.formatMemoryExtractionUserPrompt(new AiCognitionInput(
                List.of(new AiChatTurn("user", "你好")),
                new AiSessionSummary(1, 5L, "聊过面试准备。", List.of(), List.of(), List.of()),
                Map.of()));

        assertThat(prompt).doesNotContain("【本会话摘要】");
        assertThat(prompt).contains("【近期对话】");
        assertThat(prompt).contains("[user] 你好");
    }

    @Test
    void formatSessionCompactionUserPromptRequiresReplaceNotAppend() {
        HoshiAiProperties properties = new HoshiAiProperties();

        String prompt = properties.formatSessionCompactionUserPrompt(new AiCognitionInput(
                List.of(new AiChatTurn("user", "继续聊面试")),
                new AiSessionSummary(2, 10L, "之前聊过面试。", List.of("老师准备 Java 面试"), List.of(), List.of()),
                Map.of()));

        assertThat(prompt).contains("整体重写");
        assertThat(prompt).contains("禁止追加叠加");
        assertThat(prompt).contains("【当前摘要·将被整体替换】");
        assertThat(prompt).contains("之前聊过面试。");
        assertThat(prompt).contains("【待压缩的旧对话】");
        assertThat(prompt).contains("[user] 继续聊面试");
    }

    @Test
    void formatProactiveOpeningUserPromptSuggestsQuestionShareOrReminderStyle() {
        HoshiAiProperties properties = new HoshiAiProperties();

        String planPrompt = properties.formatProactiveOpeningUserPrompt(new AiCognitionInput(
                List.of(),
                null,
                Map.of(
                        "sourceType", "memory",
                        "memoryCategory", "plan",
                        "hint", "老师打算今天早点休息")));
        assertThat(planPrompt).contains("建议风格=提醒或提问");

        String openLoopPrompt = properties.formatProactiveOpeningUserPrompt(new AiCognitionInput(
                List.of(),
                null,
                Map.of(
                        "sourceType", "open_loop",
                        "memoryCategory", "",
                        "hint", "还要补自我介绍")));
        assertThat(openLoopPrompt).contains("建议风格=提问");
    }

    @Test
    void buildProactiveOpeningSystemPromptIncludesWebSearchSectionByDefault() {
        HoshiAiProperties properties = new HoshiAiProperties();

        String prompt = properties.buildProactiveOpeningSystemPrompt();

        assertThat(prompt).contains("【联网模式】");
        assertThat(prompt).contains("强制联网");
    }

    @Test
    void buildProactiveOpeningSystemPromptOmitsWebSearchWhenDisabled() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setProactiveOpeningWebSearchEnabled(false);

        String prompt = properties.buildProactiveOpeningSystemPrompt();

        assertThat(prompt).doesNotContain("【联网模式】");
    }

    @Test
    void formatCognitionContextFromChatIncludesSummaryMemoriesAndTurns() {
        HoshiAiProperties properties = new HoshiAiProperties();
        AiChatContext context = new AiChatContext(
                List.of(new AiChatTurn("user", "今晚去不了了")),
                new AiSessionSummary(1, 5L, "聊过外滩计划。", List.of(), List.of(), List.of()),
                List.of(new AiMemoryContext("1", "明天晚上去外滩玩", "short", "plan", "recent", 0.9, 0.8, 0.8, false)),
                List.of(),
                List.of(),
                new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400));

        String prompt = properties.formatCognitionContextFromChat(
                "请判断现在是否适合主动开口。",
                context,
                Map.of("hint", "外滩"));

        assertThat(prompt).contains("【会话摘要】");
        assertThat(prompt).contains("聊过外滩计划。");
        assertThat(prompt).contains("【老师最近的情况】");
        assertThat(prompt).contains("明天晚上去外滩玩");
        assertThat(prompt).contains("[user] 今晚去不了了");
        assertThat(prompt).contains("hint=外滩");
    }

    @Test
    void formatProactiveFollowUpContentUserPromptIncludesFullContext() {
        HoshiAiProperties properties = new HoshiAiProperties();
        AiChatContext context = new AiChatContext(
                List.of(new AiChatTurn("assistant", "那老师早点休息哦")),
                null,
                List.of(new AiMemoryContext("1", "老师打算今天早点休息", "short", "plan", "recent", 0.9, 0.8, 0.8, false)),
                List.of(),
                List.of(),
                new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400));
        Map<String, Object> metadata = Map.of("chatContext", context, "mode", "continue");

        String prompt = properties.formatProactiveFollowUpContentUserPrompt(
                new AiCognitionInput(context.recentTurns(), context.sessionSummary(), metadata));

        assertThat(prompt).contains("mode=continue");
        assertThat(prompt).contains("老师打算今天早点休息");
        assertThat(prompt).contains("[assistant] 那老师早点休息哦");
    }

    @Test
    void formatMemoryReconciliationUserPromptIncludesArchivedMetadataAndIds() {
        HoshiAiProperties properties = new HoshiAiProperties();

        String prompt = properties.formatMemoryReconciliationUserPrompt(new AiCognitionInput(
                List.of(new AiChatTurn("user", "[session:42] 今晚去不了了")),
                new AiSessionSummary(1, 5L, "主会话摘要", List.of(), List.of(), List.of()),
                Map.of(
                        "activeMemories", "- [id=11] [plan] 明天晚上去外滩玩",
                        "archivedCountLast7Days", 3,
                        "recentArchivedHints", "明天晚上去外滩玩",
                        "additionalSessionSummaries", "【会话摘要·sessionId=43】\n次会话摘要")));

        assertThat(prompt).contains("【活跃记忆】");
        assertThat(prompt).contains("[id=11]");
        assertThat(prompt).contains("archivedCountLast7Days=3");
        assertThat(prompt).contains("recentArchivedHints=明天晚上去外滩玩");
        assertThat(prompt).contains("【其他近期会话摘要】");
        assertThat(prompt).contains("sessionId=43");
        assertThat(prompt).contains("[session:42]");
    }
}
