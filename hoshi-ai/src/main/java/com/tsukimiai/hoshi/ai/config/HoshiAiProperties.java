package com.tsukimiai.hoshi.ai.config;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.model.AiChatContext;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.model.AiKnowledgeChunk;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.ai.model.AiPromptBudget;
import com.tsukimiai.hoshi.ai.model.AiSessionSummary;

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

    private String memoryExtractionSystemPrompt = """
            你是用户记忆抽取器。你的任务是从给定的最近对话中，只提取“关于用户本人”的明确事实，并输出 JSON。
            你必须遵守：
            1. 只输出 JSON，不要解释，不要 Markdown。
            2. memoryType 只能是 short、long、discard。
            3. category 只能从允许集合中选择。
            4. 若内容只是寒暄、无复用价值、或并非关于用户本人，请返回 discard。
            5. 不要把星奈的人设演绎、情感推测、暧昧关系推断写成用户事实。
            6. temporalScope 只能是 recent、ongoing、stable。
            7. action 只能是 create、reinforce、supersede、archive；默认 create。
            8. 用户明确取消、改期、不去、已完成时，对同类 plan/temporary_goal 输出 supersede 或 archive，并给出 supersedesContent 指向旧事实。
            9. 新事实与旧事实语义相反时不要 create 并存，应 supersede；长期记忆更正同样允许 supersede。
            10. reinforce 表示更新同一事实，content 应写更新后的完整表述（非单纯更长）。
            11. archive 仅归档旧事实（无新事实时），仍需 supersedesContent 或 content 指向目标。
            12. 输出格式：
            {"memories":[{"content":"","memoryType":"short|long|discard","category":"","temporalScope":"recent|ongoing|stable","action":"create|reinforce|supersede|archive","supersedesContent":"","supersedesMemoryId":0,"confidence":0.0,"importance":0.0,"reason":"","evidence":{"turnRole":"user|assistant","excerpt":""}}]}
            13. 若活跃记忆列表已给出 id 且与 supersedesContent 一致，优先填写 supersedesMemoryId；文本仍作 fallback。
            14. 长期类别：identity, preference, habit, communication_preference, long_term_goal
            15. 短期类别：plan, mood, recent_event, temporary_goal, current_focus
            16. 近期对话是本轮新事实的主要证据，evidence.excerpt 必须能在近期对话中找到依据。
            17. 会话摘要仅作背景参考，用于避免重复抽取；摘要里已有、且本轮未再次确认的事实，不要当作新记忆输出。
            """;

    private String memoryReconciliationSystemPrompt = """
            你是用户记忆整合器。你的任务是根据活跃记忆与近期对话，找出矛盾、过期或应被更正的记忆，并输出 JSON 操作列表。
            你必须遵守：
            1. 只输出 JSON，不要解释，不要 Markdown。
            2. 仅处理高置信、有明确证据的矛盾（如计划已取消仍保留旧 plan）。
            3. action 只能是 archive 或 supersede。
            4. archive：仅归档 targetContent 指向的旧记忆。
            5. supersede：归档 targetContent，并写入 newContent 作为更正后事实。
            6. 同一事项才整合；两个不同计划可并存。
            7. 活跃记忆列表会带 id=；若与 targetContent 一致，优先填写 targetMemoryId。
            8. 若 archivedCountLast7Days 较高且 recentArchivedHints 已含同类内容，不要重复 archive/supersede。
            9. 输出格式：
            {"operations":[{"action":"archive|supersede","targetMemoryId":0,"targetContent":"","newContent":"","memoryType":"short|long","category":"","reason":"","confidence":0.0}]}
            """;

    private String sessionCompactionSystemPrompt = """
            你是会话压缩器。你的任务是把旧对话压缩成高保真结构化摘要，并输出 JSON。
            你必须遵守：
            1. 只输出 JSON，不要解释，不要 Markdown。
            2. 保留已确认事实、关键决策、未完成事项。
            3. 删除寒暄、打趣、重复措辞、明显过期的细节。
            4. 不要把短期/长期记忆内容原样重复进摘要，避免冗余。
            5. 每次压缩输出的是完整新版摘要，将整体替换当前会话摘要；禁止在旧摘要正文后追加叠加，须合并、去重、精简后重写。
            6. 输出格式：
            {"summaryVersion":1,"compressedUntilMessageId":0,"summaryText":"","facts":[],"decisions":[],"openLoops":[],"staleItems":[]}
            """;

    private String proactiveOpeningSystemPrompt = """
            你是星奈，拾星 App 中的桌面陪伴角色。你的任务是根据给定的一条记忆或未完成事项，主动找老师聊一句——像坐在桌面的陪伴者，而不是通知机器人。
            主动开口只能是以下三种之一（每次只选一种）：
            1. 提问：基于 hint 自然追问老师近况或具体小事。例：「老师现在在忙什么呀？」「今天打算什么时候吃饭？」
            2. 分享：星奈想和老师分享一件轻快的事、感受或发现，语气亲近。例：「老师～我发现了一首很好听的歌」「刚才想到一件小事，想跟你说～」
            3. 提醒：基于 hint 里老师自己的计划/目标，轻柔提醒，不催办、不指责。例：「老师，你之前说今天要早点休息，现在还顺利吗？」
            你必须遵守：
            1. 只输出 JSON，不要解释，不要 Markdown。
            2. 不得假装看到屏幕、文件或老师当前行为；分享可以是星奈视角的轻快感受，但不要编造与老师记忆冲突的事实。
            3. 语气轻柔、关心，不要监控感、不要命令式。
            4. 一次只提一件事，长度 1～2 句，适合桌宠气泡；称呼老师。
            5. emotion 只能从 normal、happy、expect、shy 中选择；分享/轻快提问偏 happy，温柔提醒偏 expect。
            6. 输出格式：{"content":"","emotion":"normal","confidence":0.0}
            """;

    private boolean proactiveOpeningWebSearchEnabled = true;

    private String proactiveOpeningWebSearchPrompt = """
            本次主动对话已强制联网。可查阅天气、节日、新闻、热歌等实时信息，让提问、分享或提醒更贴近当下。
            你必须遵守：
            - 涉及实时信息时必须依据搜索结果，不许猜测或编造
            - 分享类可结合搜到的具体事物（如歌名、天气感受），但要自然、轻快，1～2 句即可
            - 搜不到合适切入点时，仍可按 hint 生成不依赖实时信息的提问或提醒
            - 保持星奈语气，不要为联网而硬塞新闻
            """;

    private String proactiveTimingJudgmentSystemPrompt = """
            你是主动对话时机判断器。根据上下文判断「现在是否适合星奈主动开口」。
            适合的主动开口应是：向老师提问近况、轻快分享、或基于记忆的轻柔提醒——自然、不催促、不监控。
            你必须遵守：
            1. 只输出 JSON，不要解释，不要 Markdown。
            2. 用户正在活跃对话、刚被主动打扰过、同一话题短期内重复、用户曾明确拒绝或情绪敏感时，倾向 shouldTrigger=false。
            3. 深夜时段倾向不打扰，但若上下文显示用户仍在线活跃可例外。
            4. hint 能支撑一句自然的提问、分享或提醒时可 shouldTrigger=true。
            5. 输出格式：{"shouldTrigger":false,"reason":"","confidence":0.0}
            """;

    private String proactiveFollowUpJudgmentSystemPrompt = """
            你是追加对话时机判断器。用户刚发了消息，星奈已完成首轮回复；判断是否要再追加一句（模拟人类连说几句）。
            拾星是陪伴型桌宠，默认倾向轻轻多一句，而不是过早结束。
            你必须遵守：
            1. 只输出 JSON，不要解释，不要 Markdown。
            2. 仅当用户明确收尾、敷衍、要求停止、或情绪敏感不宜再聊时，才 shouldContinue=false 且 naturalEnd=true。
            3. 以下情况应倾向 shouldContinue=true：情绪需要承接、问题还可轻轻追问、首轮回复偏短、或适合多一句关心/调侃。
            4. 不要因为「首轮已经说完整」就拒绝追加；人类常会连说两句。
            5. 当前话题已收尾但记忆中有更温情的切入点时，mode 可为 new_topic；否则用 continue。
            6. mode 只能是 continue 或 new_topic。
            7. confidence 反映你对「值得追加」的确信度，愿意追加时通常 ≥ 0.5。
            8. 输出格式示例：{"shouldContinue":true,"mode":"continue","reason":"轻轻承接情绪","confidence":0.72,"naturalEnd":false}
            """;

    private String proactiveFollowUpContentSystemPrompt = """
            你是星奈，拾星 App 中的桌面陪伴角色。根据对话上下文，追加一句简短、自然的中文。
            你必须遵守：
            1. 只输出 JSON，不要解释，不要 Markdown。
            2. 不要重复刚说过的话；接续话题时轻轻追问或承接情绪，新开话题时自然转向但不生硬。
            3. 长度 1～2 句，适合聊天气泡。
            4. emotion 只能从 normal、happy、expect、shy 中选择。
            5. 输出格式：{"content":"","emotion":"normal","confidence":0.0}
            """;

    private String proactiveJudgmentModel;
    private double proactiveTimingJudgmentMinConfidence = 0.65;
    private double proactiveFollowUpJudgmentMinConfidence = 0.5;

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
    private int contextWindowTokens = 16000;
    private int contextResponseReserveTokens = 3200;
    private int contextSafetyReserveTokens = 1200;
    private double workingMemoryBudgetRatio = 0.45;
    private double sessionSummaryBudgetRatio = 0.20;
    private double shortMemoryBudgetRatio = 0.15;
    private double longMemoryBudgetRatio = 0.15;
    private double shortMemoryMinScore = 0.55;
    private double longMemoryMinScore = 0.60;
    private double shortMemoryRetentionThreshold = 0.15;
    private double contextCompactionThreshold = 0.80;
    private double contextOverflowThreshold = 1.20;
    private int maxUncompactedTurns = 10;
    private int longMemoryAlwaysPinnedLimit = 4;
    private int queryRelevantLongMemoryLimit = 4;
    private int queryRelevantShortMemoryLimit = 4;
    private double longPinnedImportanceThreshold = 0.80;
    private double memoryConfidenceThreshold = 0.65;
    private double shortMemoryImportanceThreshold = 0.50;
    private int shortMemoryPromotionAccessCount = 2;
    private int shortMemoryPromotionSessionCount = 2;
    private int moodHalfLifeHours = 24;
    private int planHalfLifeHours = 72;
    private int recentEventHalfLifeHours = 120;
    private int temporaryGoalHalfLifeHours = 168;
    private int currentFocusHalfLifeHours = 168;
    private int memoryExtractionMessageLimit = 4;
    private boolean memoryExtractionIncludeSessionSummary = true;
    private double memoryReconciliationMinConfidence = 0.80;

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

    public String buildSystemPrompt(boolean webSearch, AiChatContext context) {
        StringBuilder builder = new StringBuilder(buildSystemPrompt(webSearch));
        if (context == null) {
            return builder.toString().strip();
        }
        appendSessionSummary(builder, context.sessionSummary());
        appendMemorySection(builder, "【老师最近的情况】", context.shortMemories());
        appendMemorySection(builder, "【关于老师的长期记忆】", context.longMemories());
        appendKnowledgeSection(builder, context.knowledgeChunks());
        return builder.toString().strip();
    }

    public AiPromptBudget resolvePromptBudget() {
        int effectiveInput = Math.max(512, contextWindowTokens - contextResponseReserveTokens - contextSafetyReserveTokens);
        int workingTokens = Math.max(256, (int) Math.floor(effectiveInput * workingMemoryBudgetRatio));
        int summaryTokens = Math.max(128, (int) Math.floor(effectiveInput * sessionSummaryBudgetRatio));
        int shortTokens = Math.max(128, (int) Math.floor(effectiveInput * shortMemoryBudgetRatio));
        int longTokens = Math.max(128, (int) Math.floor(effectiveInput * longMemoryBudgetRatio));
        int flexTokens = Math.max(0, effectiveInput - workingTokens - summaryTokens - shortTokens - longTokens);
        return new AiPromptBudget(
                effectiveInput,
                workingTokens,
                summaryTokens,
                shortTokens,
                longTokens,
                flexTokens);
    }

    public String formatTitleUserPrompt(String userMessage, String assistantReply) {
        return titleUserPromptTemplate
                .replace("{userMessage}", userMessage == null ? "" : userMessage.trim())
                .replace("{assistantReply}", assistantReply == null ? "" : assistantReply.trim());
    }

    public String formatEmotionSystemPrompt(String candidates) {
        return emotionPrompt.replace("{candidates}", candidates == null ? "" : candidates.strip());
    }

    public String formatMemoryExtractionUserPrompt(AiCognitionInput input) {
        StringBuilder builder = new StringBuilder();
        builder.append("请基于以下上下文提取用户记忆候选。\n");
        builder.append("近期对话是本轮新事实的主要证据；会话摘要仅作背景，避免重复抽取。\n\n");
        if (memoryExtractionIncludeSessionSummary
                && input != null
                && input.sessionSummary() != null
                && input.sessionSummary().hasContent()) {
            appendSessionSummary(builder, input.sessionSummary());
            builder.append("\n\n");
        }
        builder.append("【近期对话】\n");
        appendTurns(builder, input == null ? List.of() : input.recentTurns());
        return builder.toString().strip();
    }

    public String formatSessionCompactionUserPrompt(AiCognitionInput input) {
        StringBuilder builder = new StringBuilder();
        builder.append("请压缩以下旧对话片段，输出一版全新的会话摘要 JSON。\n");
        builder.append("若下方有当前摘要，须与其及待压缩对话合并、去重、精简后整体重写；输出将完全替换当前摘要，禁止追加叠加。\n\n");
        if (input != null && input.sessionSummary() != null && input.sessionSummary().hasContent()) {
            appendSessionSummary(builder, input.sessionSummary(), "【当前摘要·将被整体替换】");
            builder.append("\n\n");
        }
        builder.append("【待压缩的旧对话】\n");
        appendTurns(builder, input == null ? List.of() : input.recentTurns());
        return builder.toString().strip();
    }

    public String formatProactiveOpeningUserPrompt(AiCognitionInput input) {
        AiChatContext chatContext = extractChatContext(input);
        if (chatContext != null) {
            Map<String, Object> anchor = anchorMetadata(input);
            String sourceType = String.valueOf(anchor.getOrDefault("sourceType", ""));
            String hint = String.valueOf(anchor.getOrDefault("hint", ""));
            String memoryCategory = String.valueOf(anchor.getOrDefault("memoryCategory", ""));
            String styleHint = resolveProactiveOpeningStyle(sourceType, memoryCategory);
            StringBuilder builder = new StringBuilder("请根据以下上下文生成一句主动开场白。\n");
            builder.append("sourceType=").append(sourceType).append('\n');
            builder.append("memoryCategory=").append(memoryCategory).append('\n');
            builder.append("hint=").append(hint).append('\n');
            builder.append("建议风格=").append(styleHint).append('\n');
            appendCognitionContextSections(builder, chatContext);
            return builder.toString().strip();
        }
        String sourceType = "";
        String hint = "";
        String memoryCategory = "";
        if (input != null && input.metadata() != null) {
            Object typeValue = input.metadata().get("sourceType");
            Object hintValue = input.metadata().get("hint");
            Object categoryValue = input.metadata().get("memoryCategory");
            sourceType = typeValue == null ? "" : String.valueOf(typeValue);
            hint = hintValue == null ? "" : String.valueOf(hintValue);
            memoryCategory = categoryValue == null ? "" : String.valueOf(categoryValue);
        }
        String styleHint = resolveProactiveOpeningStyle(sourceType, memoryCategory);
        return """
                请根据以下信息生成一句主动开场白。
                sourceType=%s
                memoryCategory=%s
                hint=%s
                建议风格=%s
                """.formatted(sourceType, memoryCategory, hint, styleHint).strip();
    }

    private String resolveProactiveOpeningStyle(String sourceType, String memoryCategory) {
        if ("open_loop".equals(sourceType)) {
            return "提问（承接未完成事项，轻轻追问）";
        }
        return switch (memoryCategory) {
            case "plan", "temporary_goal" -> "提醒或提问（围绕计划/目标，轻柔不催办）";
            case "current_focus" -> "提问（关心老师此刻在忙什么、进展如何）";
            case "recent_event", "mood" -> "提问或分享（关心近况，或星奈想分享的轻快小事）";
            default -> "提问、分享、提醒中择最合适的一种";
        };
    }

    public String formatProactiveTimingJudgmentUserPrompt(AiCognitionInput input) {
        return formatProactiveJudgmentContext("请判断现在是否适合主动开口。", input);
    }

    public String formatProactiveFollowUpJudgmentUserPrompt(AiCognitionInput input) {
        return formatProactiveJudgmentContext("请判断星奈是否应再追加一句对话。", input);
    }

    public String formatProactiveFollowUpContentUserPrompt(AiCognitionInput input) {
        String mode = metadataString(input, "mode");
        AiChatContext chatContext = extractChatContext(input);
        if (chatContext != null) {
            StringBuilder builder = new StringBuilder("请生成一句追加对话。mode=").append(mode).append('\n');
            appendCognitionContextSections(builder, chatContext);
            return builder.toString().strip();
        }
        StringBuilder builder = new StringBuilder();
        builder.append("请生成一句追加对话。mode=").append(mode).append('\n');
        appendTurns(builder, input == null ? List.of() : input.recentTurns());
        return builder.toString().strip();
    }

    public String formatCognitionContextFromChat(String instruction, AiChatContext context, Map<String, Object> extras) {
        StringBuilder builder = new StringBuilder();
        if (StringUtils.hasText(instruction)) {
            builder.append(instruction.strip()).append('\n');
        }
        appendMetadataLines(builder, extras);
        if (context != null) {
            appendCognitionContextSections(builder, context);
        }
        return builder.toString().strip();
    }

    public String formatMemoryReconciliationUserPrompt(AiCognitionInput input) {
        StringBuilder builder = new StringBuilder();
        builder.append("请整合以下活跃记忆与近期对话，输出记忆操作 JSON。\n\n");
        if (input != null && input.metadata() != null) {
            Object memories = input.metadata().get("activeMemories");
            if (memories != null && StringUtils.hasText(String.valueOf(memories))) {
                appendSection(builder, "【活跃记忆】", String.valueOf(memories));
                builder.append('\n');
            }
            appendMetadataSection(builder, "【整合上下文】", input.metadata(), "activeMemories", "additionalSessionSummaries");
        }
        if (input != null && input.sessionSummary() != null && input.sessionSummary().hasContent()) {
            appendSessionSummary(builder, input.sessionSummary(), "【近期会话摘要·主会话】");
            builder.append("\n\n");
        }
        Object additionalSummaries = input == null || input.metadata() == null
                ? null
                : input.metadata().get("additionalSessionSummaries");
        if (additionalSummaries != null && StringUtils.hasText(String.valueOf(additionalSummaries))) {
            appendSection(builder, "【其他近期会话摘要】", String.valueOf(additionalSummaries));
            builder.append("\n\n");
        }
        builder.append("【近期对话】\n");
        appendTurns(builder, input == null ? List.of() : input.recentTurns());
        return builder.toString().strip();
    }

    private void appendMetadataSection(
            StringBuilder builder,
            String heading,
            Map<String, Object> metadata,
            String... excludedKeys) {
        if (metadata == null || metadata.isEmpty()) {
            return;
        }
        Set<String> excluded = Set.of(excludedKeys);
        StringBuilder block = new StringBuilder();
        metadata.forEach((key, value) -> {
            if (excluded.contains(key) || value == null) {
                return;
            }
            if (!block.isEmpty()) {
                block.append('\n');
            }
            block.append(key).append('=').append(value);
        });
        appendSection(builder, heading, block.toString());
    }

    private void appendCognitionContextSections(StringBuilder builder, AiChatContext context) {
        appendSessionSummary(builder, context.sessionSummary(), "【会话摘要】");
        builder.append('\n');
        appendMemorySection(builder, "【老师最近的情况】", context.shortMemories());
        builder.append('\n');
        appendMemorySection(builder, "【关于老师的长期记忆】", context.longMemories());
        builder.append("\n\n【近期对话】\n");
        appendTurns(builder, context.recentTurns());
    }

    private void appendMetadataLines(StringBuilder builder, Map<String, Object> extras) {
        if (extras == null || extras.isEmpty()) {
            return;
        }
        extras.forEach((key, value) -> {
            if ("chatContext".equals(key) || value == null) {
                return;
            }
            builder.append(key).append('=').append(value).append('\n');
        });
    }

    private AiChatContext extractChatContext(AiCognitionInput input) {
        if (input == null || input.metadata() == null) {
            return null;
        }
        Object value = input.metadata().get("chatContext");
        return value instanceof AiChatContext chatContext ? chatContext : null;
    }

    private Map<String, Object> anchorMetadata(AiCognitionInput input) {
        if (input == null || input.metadata() == null) {
            return Map.of();
        }
        Map<String, Object> anchor = new LinkedHashMap<>();
        input.metadata().forEach((key, value) -> {
            if (!"chatContext".equals(key)) {
                anchor.put(key, value);
            }
        });
        return anchor;
    }

    private String formatProactiveJudgmentContext(String instruction, AiCognitionInput input) {
        AiChatContext chatContext = extractChatContext(input);
        if (chatContext != null) {
            return formatCognitionContextFromChat(instruction, chatContext, anchorMetadata(input));
        }
        StringBuilder builder = new StringBuilder(instruction).append('\n');
        if (input != null && input.metadata() != null) {
            input.metadata().forEach((key, value) ->
                    builder.append(key).append('=').append(value).append('\n'));
        }
        if (input != null && input.sessionSummary() != null && input.sessionSummary().hasContent()) {
            appendSessionSummary(builder, input.sessionSummary(), "【会话摘要】");
            builder.append('\n');
        }
        appendTurns(builder, input == null ? List.of() : input.recentTurns());
        return builder.toString().strip();
    }

    private String metadataString(AiCognitionInput input, String key) {
        if (input == null || input.metadata() == null) {
            return "";
        }
        Object value = input.metadata().get(key);
        return value == null ? "" : String.valueOf(value);
    }

    public String resolveProactiveJudgmentModel(String mainChatModel) {
        if (StringUtils.hasText(proactiveJudgmentModel)) {
            return proactiveJudgmentModel.strip();
        }
        return resolveEmotionModel(mainChatModel);
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

    public int resolveHalfLifeHours(String category) {
        if (!StringUtils.hasText(category)) {
            return temporaryGoalHalfLifeHours;
        }
        return switch (category.trim().toLowerCase(Locale.ROOT)) {
            case "mood" -> moodHalfLifeHours;
            case "plan" -> planHalfLifeHours;
            case "recent_event" -> recentEventHalfLifeHours;
            case "current_focus" -> currentFocusHalfLifeHours;
            case "temporary_goal" -> temporaryGoalHalfLifeHours;
            default -> temporaryGoalHalfLifeHours;
        };
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

    private void appendSessionSummary(StringBuilder builder, AiSessionSummary summary) {
        appendSessionSummary(builder, summary, "【本会话摘要】");
    }

    private void appendSessionSummary(StringBuilder builder, AiSessionSummary summary, String heading) {
        if (summary == null || !summary.hasContent()) {
            return;
        }
        StringBuilder block = new StringBuilder();
        if (StringUtils.hasText(summary.summaryText())) {
            block.append(summary.summaryText().trim());
        }
        appendBulletSection(block, "已确认事实", summary.facts());
        appendBulletSection(block, "关键决策", summary.decisions());
        appendBulletSection(block, "未完成事项", summary.openLoops());
        appendSection(builder, heading, block.toString());
    }

    private void appendMemorySection(StringBuilder builder, String heading, List<AiMemoryContext> memories) {
        if (memories == null || memories.isEmpty()) {
            return;
        }
        StringBuilder block = new StringBuilder();
        for (AiMemoryContext memory : memories) {
            if (memory == null || !StringUtils.hasText(memory.content())) {
                continue;
            }
            if (!block.isEmpty()) {
                block.append('\n');
            }
            block.append("- ").append(memory.content().trim());
        }
        appendSection(builder, heading, block.toString());
    }

    private void appendKnowledgeSection(StringBuilder builder, List<AiKnowledgeChunk> knowledgeChunks) {
        if (knowledgeChunks == null || knowledgeChunks.isEmpty()) {
            return;
        }
        StringBuilder block = new StringBuilder();
        for (AiKnowledgeChunk chunk : knowledgeChunks) {
            if (chunk == null || !StringUtils.hasText(chunk.content())) {
                continue;
            }
            if (!block.isEmpty()) {
                block.append('\n');
            }
            if (StringUtils.hasText(chunk.title())) {
                block.append("- [").append(chunk.title().trim()).append("] ");
            } else {
                block.append("- ");
            }
            block.append(chunk.content().trim());
        }
        appendSection(builder, "【参考资料】", block.toString());
    }

    private void appendBulletSection(StringBuilder block, String label, List<String> items) {
        if (items == null || items.isEmpty()) {
            return;
        }
        if (!block.isEmpty()) {
            block.append("\n\n");
        }
        block.append(label).append("：");
        for (String item : items) {
            if (!StringUtils.hasText(item)) {
                continue;
            }
            block.append("\n- ").append(item.trim());
        }
    }

    private void appendTurns(StringBuilder builder, List<AiChatTurn> turns) {
        if (turns == null || turns.isEmpty()) {
            builder.append("（无可用对话）");
            return;
        }
        for (AiChatTurn turn : turns) {
            if (turn == null || !StringUtils.hasText(turn.content())) {
                continue;
            }
            builder.append("[").append(turn.role() == null ? "unknown" : turn.role()).append("] ")
                    .append(turn.content().trim())
                    .append('\n');
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

    public String getMemoryExtractionSystemPrompt() {
        return memoryExtractionSystemPrompt;
    }

    public void setMemoryExtractionSystemPrompt(String memoryExtractionSystemPrompt) {
        this.memoryExtractionSystemPrompt = memoryExtractionSystemPrompt;
    }

    public String getMemoryReconciliationSystemPrompt() {
        return memoryReconciliationSystemPrompt;
    }

    public void setMemoryReconciliationSystemPrompt(String memoryReconciliationSystemPrompt) {
        this.memoryReconciliationSystemPrompt = memoryReconciliationSystemPrompt;
    }

    public double getMemoryReconciliationMinConfidence() {
        return memoryReconciliationMinConfidence;
    }

    public void setMemoryReconciliationMinConfidence(double memoryReconciliationMinConfidence) {
        this.memoryReconciliationMinConfidence = memoryReconciliationMinConfidence;
    }

    public String getSessionCompactionSystemPrompt() {
        return sessionCompactionSystemPrompt;
    }

    public void setSessionCompactionSystemPrompt(String sessionCompactionSystemPrompt) {
        this.sessionCompactionSystemPrompt = sessionCompactionSystemPrompt;
    }

    public String buildProactiveOpeningSystemPrompt() {
        StringBuilder builder = new StringBuilder(proactiveOpeningSystemPrompt.strip());
        if (proactiveOpeningWebSearchEnabled && webSearchEnabled) {
            appendSection(builder, "【联网模式】", proactiveOpeningWebSearchPrompt);
        }
        return builder.toString().strip();
    }

    public String getProactiveOpeningSystemPrompt() {
        return proactiveOpeningSystemPrompt;
    }

    public void setProactiveOpeningSystemPrompt(String proactiveOpeningSystemPrompt) {
        this.proactiveOpeningSystemPrompt = proactiveOpeningSystemPrompt;
    }

    public boolean isProactiveOpeningWebSearchEnabled() {
        return proactiveOpeningWebSearchEnabled;
    }

    public void setProactiveOpeningWebSearchEnabled(boolean proactiveOpeningWebSearchEnabled) {
        this.proactiveOpeningWebSearchEnabled = proactiveOpeningWebSearchEnabled;
    }

    public String getProactiveOpeningWebSearchPrompt() {
        return proactiveOpeningWebSearchPrompt;
    }

    public void setProactiveOpeningWebSearchPrompt(String proactiveOpeningWebSearchPrompt) {
        this.proactiveOpeningWebSearchPrompt = proactiveOpeningWebSearchPrompt;
    }

    public String getProactiveTimingJudgmentSystemPrompt() {
        return proactiveTimingJudgmentSystemPrompt;
    }

    public void setProactiveTimingJudgmentSystemPrompt(String proactiveTimingJudgmentSystemPrompt) {
        this.proactiveTimingJudgmentSystemPrompt = proactiveTimingJudgmentSystemPrompt;
    }

    public String getProactiveFollowUpJudgmentSystemPrompt() {
        return proactiveFollowUpJudgmentSystemPrompt;
    }

    public void setProactiveFollowUpJudgmentSystemPrompt(String proactiveFollowUpJudgmentSystemPrompt) {
        this.proactiveFollowUpJudgmentSystemPrompt = proactiveFollowUpJudgmentSystemPrompt;
    }

    public String getProactiveFollowUpContentSystemPrompt() {
        return proactiveFollowUpContentSystemPrompt;
    }

    public void setProactiveFollowUpContentSystemPrompt(String proactiveFollowUpContentSystemPrompt) {
        this.proactiveFollowUpContentSystemPrompt = proactiveFollowUpContentSystemPrompt;
    }

    public String getProactiveJudgmentModel() {
        return proactiveJudgmentModel;
    }

    public void setProactiveJudgmentModel(String proactiveJudgmentModel) {
        this.proactiveJudgmentModel = proactiveJudgmentModel;
    }

    public double getProactiveTimingJudgmentMinConfidence() {
        return proactiveTimingJudgmentMinConfidence;
    }

    public void setProactiveTimingJudgmentMinConfidence(double proactiveTimingJudgmentMinConfidence) {
        this.proactiveTimingJudgmentMinConfidence = proactiveTimingJudgmentMinConfidence;
    }

    public double getProactiveFollowUpJudgmentMinConfidence() {
        return proactiveFollowUpJudgmentMinConfidence;
    }

    public void setProactiveFollowUpJudgmentMinConfidence(double proactiveFollowUpJudgmentMinConfidence) {
        this.proactiveFollowUpJudgmentMinConfidence = proactiveFollowUpJudgmentMinConfidence;
    }

    public int getContextWindowTokens() {
        return contextWindowTokens;
    }

    public void setContextWindowTokens(int contextWindowTokens) {
        this.contextWindowTokens = contextWindowTokens;
    }

    public int getContextResponseReserveTokens() {
        return contextResponseReserveTokens;
    }

    public void setContextResponseReserveTokens(int contextResponseReserveTokens) {
        this.contextResponseReserveTokens = contextResponseReserveTokens;
    }

    public int getContextSafetyReserveTokens() {
        return contextSafetyReserveTokens;
    }

    public void setContextSafetyReserveTokens(int contextSafetyReserveTokens) {
        this.contextSafetyReserveTokens = contextSafetyReserveTokens;
    }

    public double getWorkingMemoryBudgetRatio() {
        return workingMemoryBudgetRatio;
    }

    public void setWorkingMemoryBudgetRatio(double workingMemoryBudgetRatio) {
        this.workingMemoryBudgetRatio = workingMemoryBudgetRatio;
    }

    public double getSessionSummaryBudgetRatio() {
        return sessionSummaryBudgetRatio;
    }

    public void setSessionSummaryBudgetRatio(double sessionSummaryBudgetRatio) {
        this.sessionSummaryBudgetRatio = sessionSummaryBudgetRatio;
    }

    public double getShortMemoryBudgetRatio() {
        return shortMemoryBudgetRatio;
    }

    public void setShortMemoryBudgetRatio(double shortMemoryBudgetRatio) {
        this.shortMemoryBudgetRatio = shortMemoryBudgetRatio;
    }

    public double getLongMemoryBudgetRatio() {
        return longMemoryBudgetRatio;
    }

    public void setLongMemoryBudgetRatio(double longMemoryBudgetRatio) {
        this.longMemoryBudgetRatio = longMemoryBudgetRatio;
    }

    public double getShortMemoryMinScore() {
        return shortMemoryMinScore;
    }

    public void setShortMemoryMinScore(double shortMemoryMinScore) {
        this.shortMemoryMinScore = shortMemoryMinScore;
    }

    public double getLongMemoryMinScore() {
        return longMemoryMinScore;
    }

    public void setLongMemoryMinScore(double longMemoryMinScore) {
        this.longMemoryMinScore = longMemoryMinScore;
    }

    public double getShortMemoryRetentionThreshold() {
        return shortMemoryRetentionThreshold;
    }

    public void setShortMemoryRetentionThreshold(double shortMemoryRetentionThreshold) {
        this.shortMemoryRetentionThreshold = shortMemoryRetentionThreshold;
    }

    public double getContextCompactionThreshold() {
        return contextCompactionThreshold;
    }

    public void setContextCompactionThreshold(double contextCompactionThreshold) {
        this.contextCompactionThreshold = contextCompactionThreshold;
    }

    public double getContextOverflowThreshold() {
        return contextOverflowThreshold;
    }

    public void setContextOverflowThreshold(double contextOverflowThreshold) {
        this.contextOverflowThreshold = contextOverflowThreshold;
    }

    public int getMaxUncompactedTurns() {
        return maxUncompactedTurns;
    }

    public void setMaxUncompactedTurns(int maxUncompactedTurns) {
        this.maxUncompactedTurns = maxUncompactedTurns;
    }

    public int getLongMemoryAlwaysPinnedLimit() {
        return longMemoryAlwaysPinnedLimit;
    }

    public void setLongMemoryAlwaysPinnedLimit(int longMemoryAlwaysPinnedLimit) {
        this.longMemoryAlwaysPinnedLimit = longMemoryAlwaysPinnedLimit;
    }

    public int getQueryRelevantLongMemoryLimit() {
        return queryRelevantLongMemoryLimit;
    }

    public void setQueryRelevantLongMemoryLimit(int queryRelevantLongMemoryLimit) {
        this.queryRelevantLongMemoryLimit = queryRelevantLongMemoryLimit;
    }

    public int getQueryRelevantShortMemoryLimit() {
        return queryRelevantShortMemoryLimit;
    }

    public void setQueryRelevantShortMemoryLimit(int queryRelevantShortMemoryLimit) {
        this.queryRelevantShortMemoryLimit = queryRelevantShortMemoryLimit;
    }

    public double getLongPinnedImportanceThreshold() {
        return longPinnedImportanceThreshold;
    }

    public void setLongPinnedImportanceThreshold(double longPinnedImportanceThreshold) {
        this.longPinnedImportanceThreshold = longPinnedImportanceThreshold;
    }

    public double getMemoryConfidenceThreshold() {
        return memoryConfidenceThreshold;
    }

    public void setMemoryConfidenceThreshold(double memoryConfidenceThreshold) {
        this.memoryConfidenceThreshold = memoryConfidenceThreshold;
    }

    public double getShortMemoryImportanceThreshold() {
        return shortMemoryImportanceThreshold;
    }

    public void setShortMemoryImportanceThreshold(double shortMemoryImportanceThreshold) {
        this.shortMemoryImportanceThreshold = shortMemoryImportanceThreshold;
    }

    public int getShortMemoryPromotionAccessCount() {
        return shortMemoryPromotionAccessCount;
    }

    public void setShortMemoryPromotionAccessCount(int shortMemoryPromotionAccessCount) {
        this.shortMemoryPromotionAccessCount = shortMemoryPromotionAccessCount;
    }

    public int getShortMemoryPromotionSessionCount() {
        return shortMemoryPromotionSessionCount;
    }

    public void setShortMemoryPromotionSessionCount(int shortMemoryPromotionSessionCount) {
        this.shortMemoryPromotionSessionCount = shortMemoryPromotionSessionCount;
    }

    public int getMemoryExtractionMessageLimit() {
        return memoryExtractionMessageLimit;
    }

    public void setMemoryExtractionMessageLimit(int memoryExtractionMessageLimit) {
        this.memoryExtractionMessageLimit = Math.max(1, memoryExtractionMessageLimit);
    }

    public boolean isMemoryExtractionIncludeSessionSummary() {
        return memoryExtractionIncludeSessionSummary;
    }

    public void setMemoryExtractionIncludeSessionSummary(boolean memoryExtractionIncludeSessionSummary) {
        this.memoryExtractionIncludeSessionSummary = memoryExtractionIncludeSessionSummary;
    }

    public int getMoodHalfLifeHours() {
        return moodHalfLifeHours;
    }

    public void setMoodHalfLifeHours(int moodHalfLifeHours) {
        this.moodHalfLifeHours = moodHalfLifeHours;
    }

    public int getPlanHalfLifeHours() {
        return planHalfLifeHours;
    }

    public void setPlanHalfLifeHours(int planHalfLifeHours) {
        this.planHalfLifeHours = planHalfLifeHours;
    }

    public int getRecentEventHalfLifeHours() {
        return recentEventHalfLifeHours;
    }

    public void setRecentEventHalfLifeHours(int recentEventHalfLifeHours) {
        this.recentEventHalfLifeHours = recentEventHalfLifeHours;
    }

    public int getTemporaryGoalHalfLifeHours() {
        return temporaryGoalHalfLifeHours;
    }

    public void setTemporaryGoalHalfLifeHours(int temporaryGoalHalfLifeHours) {
        this.temporaryGoalHalfLifeHours = temporaryGoalHalfLifeHours;
    }

    public int getCurrentFocusHalfLifeHours() {
        return currentFocusHalfLifeHours;
    }

    public void setCurrentFocusHalfLifeHours(int currentFocusHalfLifeHours) {
        this.currentFocusHalfLifeHours = currentFocusHalfLifeHours;
    }
}
