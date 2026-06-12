package com.tsukimiai.hoshi.ai.config;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

@ConfigurationProperties(prefix = "hoshi.ai")
public class HoshiAiProperties {

    private String identity = """
            你是星奈，拾星 App 中的桌面陪伴角色。
            """;

    private String worldview = """
            拾星是一款桌面陪伴 App，用户通过聊天与星奈互动。
            星奈生活在用户的桌面上，不能查看或操作用户的屏幕与文件。
            """;

    private String styleGuide = """
            请用自然、温暖、简洁的中文与用户交流，保持友好但不过度卖萌。
            产品名叫拾星，你是星奈，不要混淆两者。
            先给结论，再补充说明；技术问题要清楚，必要时使用 Markdown 代码块。
            每句话表达一种语气，需要转折时用句号分成多句。
            不确定时诚实说明，不要编造，不要假装能操作系统。
            """;

    private List<AiFewShotExample> fewShots = new ArrayList<>();

    private List<AiFixedReply> fixedReplies = new ArrayList<>();

    private String emotionModel = "qwen-turbo";

    private String emotionPrompt = """
            你是情绪分类器。从以下候选中选一个最匹配的标签，只输出标签本身，不要解释：
            {candidates}
            讲解知识、代码或步骤且无情绪波动时选 normal。
            """;

    private String titleSystemPrompt = "你是会话标题生成器。";

    private String titleUserPromptTemplate = """
            根据下面这段对话，生成一个简短的中文会话标题（6-12 个字）。
            只输出标题本身，不要引号、不要句号、不要其它说明。

            用户：{userMessage}
            助手：{assistantReply}
            """;

    private boolean webSearchEnabled = true;
    private boolean webSearchForced = false;
    private String webSearchStrategy = "auto";
    private boolean webSearchExtensionEnabled = true;
    private String webSearchPrompt = """
            用户已手动开启联网。回答天气、新闻、股价等实时问题时：
            - 必须依据搜索结果，不许猜测或编造
            - 先一句话说结论，再用 1～2 句补充；总篇幅控制在 3～5 句
            - 保持星奈语气：平淡里带一点可爱，可加「～」或颜文字，但不要撒娇过头
            - 不要写动作旁白，不要堆砌比喻，不要刻意扯到「星」
            - 搜不到就直说「这个我现在查不到」
            """;
    private List<AiFewShotExample> webSearchFewShots = new ArrayList<>();

    private int maxContextMessages = 20;
    private int maxSentenceBufferChars = 24;
    private int sentencePlaybackCharDelayMs = 24;
    private int sentenceGapDelayMs = 480;

    public Map<String, Object> buildWebSearchExtraBody() {
        return buildWebSearchExtraBody(false, null);
    }

    public Map<String, Object> buildWebSearchExtraBody(boolean userRequested) {
        return buildWebSearchExtraBody(userRequested, null);
    }

    public Map<String, Object> buildWebSearchExtraBody(boolean userRequested, String modelName) {
        String strategy = resolveWebSearchStrategy(modelName);
        Map<String, Object> extraBody = new LinkedHashMap<>();
        extraBody.put("enable_search", true);
        Map<String, Object> searchOptions = new LinkedHashMap<>();
        searchOptions.put("search_strategy", strategy);
        if (userRequested || webSearchForced) {
            searchOptions.put("forced_search", true);
        }
        if (webSearchExtensionEnabled && !isAgentStrategy(strategy)) {
            searchOptions.put("enable_search_extension", true);
        }
        extraBody.put("search_options", searchOptions);
        return extraBody;
    }

    public String resolveWebSearchStrategy(String modelName) {
        if (StringUtils.hasText(webSearchStrategy) && !"auto".equalsIgnoreCase(webSearchStrategy.strip())) {
            return webSearchStrategy.strip();
        }
        if (supportsAgentSearch(modelName)) {
            return "agent";
        }
        return "max";
    }

    private boolean supportsAgentSearch(String modelName) {
        if (!StringUtils.hasText(modelName)) {
            return false;
        }
        String model = modelName.toLowerCase(Locale.ROOT);
        return model.contains("qwen3.5-plus")
                || model.contains("qwen3.5-flash")
                || model.contains("qwen3.5-omni")
                || model.contains("qwen3-max")
                || model.contains("qwen3.7-max");
    }

    private boolean isAgentStrategy(String strategy) {
        return "agent".equalsIgnoreCase(strategy) || "agent_max".equalsIgnoreCase(strategy);
    }

    public String buildSystemPrompt() {
        return buildSystemPrompt(false);
    }

    public String buildSystemPrompt(boolean webSearch) {
        StringBuilder builder = new StringBuilder();
        appendSection(builder, "【身份】", identity);
        appendSection(builder, "【世界观】", worldview);
        appendSection(builder, "【回复方式】", styleGuide);
        appendFewShots(builder);
        if (webSearch) {
            appendSection(builder, "【联网模式】", webSearchPrompt);
            appendFewShots(builder, webSearchFewShots, "【联网示例】");
        }
        return builder.toString().strip();
    }

    public String formatTitleUserPrompt(String userMessage, String assistantReply) {
        return titleUserPromptTemplate
                .replace("{userMessage}", userMessage == null ? "" : userMessage.trim())
                .replace("{assistantReply}", assistantReply == null ? "" : assistantReply.trim());
    }

    public String formatEmotionSystemPrompt(String candidates) {
        return emotionPrompt.replace("{candidates}", candidates == null ? "" : candidates.strip());
    }

    public String resolveEmotionModel(String mainChatModel) {
        if (StringUtils.hasText(emotionModel)) {
            return emotionModel.strip();
        }
        return mainChatModel;
    }

    /**
     * 若用户消息命中固定回复规则，返回对应文案；否则返回 null。
     * 按配置顺序匹配，先命中先返回。
     */
    public String findFixedReply(String userMessage) {
        if (!StringUtils.hasText(userMessage) || fixedReplies == null || fixedReplies.isEmpty()) {
            return null;
        }
        String normalized = userMessage.strip();
        for (AiFixedReply entry : fixedReplies) {
            if (entry == null || !StringUtils.hasText(entry.getReply())) {
                continue;
            }
            if (matchesFixedReply(normalized, entry)) {
                return entry.getReply().strip();
            }
        }
        return null;
    }

    private boolean matchesFixedReply(String userMessage, AiFixedReply entry) {
        List<String> triggers = entry.getTriggers();
        if (triggers == null || triggers.isEmpty()) {
            return false;
        }
        boolean exact = "exact".equalsIgnoreCase(entry.getMatch());
        for (String trigger : triggers) {
            if (!StringUtils.hasText(trigger)) {
                continue;
            }
            String normalizedTrigger = trigger.strip();
            if (exact) {
                if (userMessage.equals(normalizedTrigger)) {
                    return true;
                }
            } else if (userMessage.contains(normalizedTrigger)) {
                return true;
            }
        }
        return false;
    }

    private void appendSection(StringBuilder builder, String heading, String content) {
        if (!StringUtils.hasText(content)) {
            return;
        }
        if (!builder.isEmpty()) {
            builder.append("\n\n");
        }
        builder.append(heading).append('\n').append(content.strip());
    }

    private void appendFewShots(StringBuilder builder) {
        appendFewShots(builder, fewShots, "【示例】");
    }

    private void appendFewShots(StringBuilder builder, List<AiFewShotExample> shots, String heading) {
        if (shots == null || shots.isEmpty()) {
            return;
        }
        StringBuilder examples = new StringBuilder();
        for (AiFewShotExample shot : shots) {
            if (shot == null || !StringUtils.hasText(shot.getUser()) || !StringUtils.hasText(shot.getAssistant())) {
                continue;
            }
            if (!examples.isEmpty()) {
                examples.append('\n');
            }
            examples.append("用户：").append(shot.getUser().strip()).append('\n');
            examples.append("星奈：").append(shot.getAssistant().strip());
        }
        if (!examples.isEmpty()) {
            appendSection(builder, heading, examples.toString());
        }
    }

    public String getIdentity() {
        return identity;
    }

    public void setIdentity(String identity) {
        this.identity = identity;
    }

    public String getWorldview() {
        return worldview;
    }

    public void setWorldview(String worldview) {
        this.worldview = worldview;
    }

    public String getStyleGuide() {
        return styleGuide;
    }

    public void setStyleGuide(String styleGuide) {
        this.styleGuide = styleGuide;
    }

    public List<AiFewShotExample> getFewShots() {
        return fewShots;
    }

    public void setFewShots(List<AiFewShotExample> fewShots) {
        this.fewShots = fewShots == null ? new ArrayList<>() : fewShots;
    }

    public List<AiFixedReply> getFixedReplies() {
        return fixedReplies;
    }

    public void setFixedReplies(List<AiFixedReply> fixedReplies) {
        this.fixedReplies = fixedReplies == null ? new ArrayList<>() : fixedReplies;
    }

    public boolean isWebSearchEnabled() {
        return webSearchEnabled;
    }

    public void setWebSearchEnabled(boolean webSearchEnabled) {
        this.webSearchEnabled = webSearchEnabled;
    }

    public boolean isWebSearchForced() {
        return webSearchForced;
    }

    public void setWebSearchForced(boolean webSearchForced) {
        this.webSearchForced = webSearchForced;
    }

    public String getWebSearchStrategy() {
        return webSearchStrategy;
    }

    public void setWebSearchStrategy(String webSearchStrategy) {
        this.webSearchStrategy = webSearchStrategy;
    }

    public boolean isWebSearchExtensionEnabled() {
        return webSearchExtensionEnabled;
    }

    public void setWebSearchExtensionEnabled(boolean webSearchExtensionEnabled) {
        this.webSearchExtensionEnabled = webSearchExtensionEnabled;
    }

    public String getWebSearchPrompt() {
        return webSearchPrompt;
    }

    public void setWebSearchPrompt(String webSearchPrompt) {
        this.webSearchPrompt = webSearchPrompt;
    }

    public List<AiFewShotExample> getWebSearchFewShots() {
        return webSearchFewShots;
    }

    public void setWebSearchFewShots(List<AiFewShotExample> webSearchFewShots) {
        this.webSearchFewShots = webSearchFewShots == null ? new ArrayList<>() : webSearchFewShots;
    }

    public int getMaxContextMessages() {
        return maxContextMessages;
    }

    public void setMaxContextMessages(int maxContextMessages) {
        this.maxContextMessages = maxContextMessages;
    }

    public int getMaxSentenceBufferChars() {
        return maxSentenceBufferChars;
    }

    public void setMaxSentenceBufferChars(int maxSentenceBufferChars) {
        this.maxSentenceBufferChars = maxSentenceBufferChars;
    }

    public int getSentencePlaybackCharDelayMs() {
        return sentencePlaybackCharDelayMs;
    }

    public void setSentencePlaybackCharDelayMs(int sentencePlaybackCharDelayMs) {
        this.sentencePlaybackCharDelayMs = sentencePlaybackCharDelayMs;
    }

    public int getSentenceGapDelayMs() {
        return sentenceGapDelayMs;
    }

    public void setSentenceGapDelayMs(int sentenceGapDelayMs) {
        this.sentenceGapDelayMs = sentenceGapDelayMs;
    }

    public String getEmotionModel() {
        return emotionModel;
    }

    public void setEmotionModel(String emotionModel) {
        this.emotionModel = emotionModel;
    }

    public String getEmotionPrompt() {
        return emotionPrompt;
    }

    public void setEmotionPrompt(String emotionPrompt) {
        this.emotionPrompt = emotionPrompt;
    }

    public String getTitleSystemPrompt() {
        return titleSystemPrompt;
    }

    public void setTitleSystemPrompt(String titleSystemPrompt) {
        this.titleSystemPrompt = titleSystemPrompt;
    }

    public String getTitleUserPromptTemplate() {
        return titleUserPromptTemplate;
    }

    public void setTitleUserPromptTemplate(String titleUserPromptTemplate) {
        this.titleUserPromptTemplate = titleUserPromptTemplate;
    }
}
