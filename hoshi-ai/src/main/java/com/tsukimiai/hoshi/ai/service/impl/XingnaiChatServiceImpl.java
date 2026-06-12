package com.tsukimiai.hoshi.ai.service.impl;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.common.exception.AiServiceException;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;

import reactor.core.publisher.Flux;

@Service
public class XingnaiChatServiceImpl implements XingnaiChatService {

    private static final Logger log = LoggerFactory.getLogger(XingnaiChatServiceImpl.class);
    private static final Duration STREAM_TIMEOUT = Duration.ofMinutes(2);
    private static final Pattern CODE_KEYWORD_PATTERN = Pattern.compile(
            "\\b(public|private|class|interface|enum|void|return|import|const|let|var|function|def|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Map<String, String> EMOTION_ALIASES = Map.ofEntries(
            Map.entry("正常", "normal"),
            Map.entry("开心", "happy"),
            Map.entry("很高兴", "very-happy"),
            Map.entry("害羞", "shy"),
            Map.entry("困惑", "confused"),
            Map.entry("疑惑", "doubt"),
            Map.entry("生气", "angry"),
            Map.entry("难过", "sad"),
            Map.entry("惊讶", "shock"),
            Map.entry("期待", "expect"),
            Map.entry("喜欢", "like"),
            Map.entry("很喜欢", "very-like"));

    private final ObjectProvider<ChatModel> chatModelProvider;
    private final HoshiAiProperties hoshiAiProperties;
    private final String chatModel;

    public XingnaiChatServiceImpl(
            ObjectProvider<ChatModel> chatModelProvider,
            HoshiAiProperties hoshiAiProperties,
            @Value("${spring.ai.openai.chat.model:qwen-plus}") String chatModel) {
        this.chatModelProvider = chatModelProvider;
        this.hoshiAiProperties = hoshiAiProperties;
        this.chatModel = chatModel;
    }

    @Override
    public String complete(List<AiChatTurn> history) {
        ChatModel chatModel = requireChatModel();
        Prompt prompt = buildPrompt(history);
        try {
            String reply = chatModel.call(prompt).getResult().getOutput().getText();
            if (!StringUtils.hasText(reply)) {
                throw AiServiceException.emptyResponse();
            }
            return reply.trim();
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("AI completion failed", ex);
            throw AiServiceException.unavailable(ex);
        }
    }

    @Override
    public Flux<String> stream(List<AiChatTurn> history) {
        return stream(history, false);
    }

    @Override
    public Flux<String> stream(List<AiChatTurn> history, boolean webSearch) {
        ChatModel chatModel = requireChatModel();
        Prompt prompt = buildPrompt(history, webSearch);
        AtomicReference<String> accumulated = new AtomicReference<>("");
        return chatModel.stream(prompt)
                .timeout(STREAM_TIMEOUT)
                .mapNotNull(chunk -> toDelta(chunk, accumulated))
                .filter(StringUtils::hasText)
                .onErrorMap(ex -> {
                    log.warn("AI stream failed: {}", rootCauseMessage(ex), ex);
                    return AiServiceException.unavailable(ex);
                });
    }

    @Override
    public String suggestSessionTitle(String userMessage, String assistantReply) {
        ChatModel chatModel = requireChatModel();
        String promptText = hoshiAiProperties.formatTitleUserPrompt(userMessage, assistantReply);
        Prompt prompt = new Prompt(List.of(
                new SystemMessage(hoshiAiProperties.getTitleSystemPrompt()),
                new UserMessage(promptText)));
        try {
            String title = chatModel.call(prompt).getResult().getOutput().getText();
            if (!StringUtils.hasText(title)) {
                return null;
            }
            return sanitizeTitle(title);
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("AI session title generation failed", ex);
            return null;
        }
    }

    @Override
    public String suggestEmotion(String assistantReply, List<String> allowedEmotions) {
        if (!StringUtils.hasText(assistantReply) || allowedEmotions == null || allowedEmotions.isEmpty()) {
            return null;
        }
        if (looksLikeCodeContent(assistantReply) && allowedEmotions.contains("normal")) {
            return "normal";
        }

        ChatModel model = requireChatModel();
        String candidates = String.join(",", allowedEmotions);
        Prompt prompt = new Prompt(
                List.of(
                        new SystemMessage(hoshiAiProperties.formatEmotionSystemPrompt(candidates)),
                        new UserMessage(assistantReply.trim())),
                OpenAiChatOptions.builder()
                        .model(hoshiAiProperties.resolveEmotionModel(this.chatModel))
                        .build());
        try {
            String emotion = model.call(prompt).getResult().getOutput().getText();
            return resolveAllowedEmotion(emotion, allowedEmotions);
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("AI emotion classification failed", ex);
            return null;
        }
    }

    private String sanitizeTitle(String title) {
        String normalized = title.trim()
                .replaceAll("[\"'「」『』]", "")
                .replaceAll("[\\r\\n]+", " ")
                .strip();
        if (normalized.length() > 32) {
            normalized = normalized.substring(0, 32).trim();
        }
        return StringUtils.hasText(normalized) ? normalized : null;
    }

    private String sanitizeEmotionValue(String emotion) {
        String normalized = emotion.trim()
                .replaceAll("[\"'`“”‘’]", "")
                .replace('_', '-')
                .replaceAll("[\\r\\n]+", " ")
                .replaceAll("\\s+", "-")
                .toLowerCase(Locale.ROOT)
                .replaceAll("^[^a-z-]+", "")
                .replaceAll("[^a-z-]+$", "");
        return StringUtils.hasText(normalized) ? normalized : null;
    }

    private String resolveAllowedEmotion(String raw, List<String> allowedEmotions) {
        if (!StringUtils.hasText(raw) || allowedEmotions == null || allowedEmotions.isEmpty()) {
            return null;
        }
        String trimmed = raw.trim();
        String sanitized = sanitizeEmotionValue(trimmed);
        if (StringUtils.hasText(sanitized)) {
            for (String allowed : allowedEmotions) {
                if (allowed.equalsIgnoreCase(sanitized)) {
                    return allowed;
                }
            }
        }
        String alias = EMOTION_ALIASES.get(trimmed);
        if (alias != null && allowedEmotions.contains(alias)) {
            return alias;
        }
        for (String allowed : allowedEmotions) {
            if (trimmed.equalsIgnoreCase(allowed)) {
                return allowed;
            }
        }
        String lowered = trimmed.toLowerCase(Locale.ROOT);
        return allowedEmotions.stream()
                .sorted(Comparator.comparingInt(String::length).reversed())
                .filter(allowed -> lowered.contains(allowed.toLowerCase(Locale.ROOT)))
                .findFirst()
                .orElse(null);
    }

    private boolean looksLikeCodeContent(String text) {
        String trimmed = text.trim();
        if (trimmed.startsWith("```") || trimmed.contains("\n```") || trimmed.contains("`")) {
            return true;
        }

        int codeSignals = 0;
        if (trimmed.contains("->") || trimmed.contains("::") || trimmed.contains("()")) {
            codeSignals++;
        }
        if (trimmed.contains("{") || trimmed.contains("}") || trimmed.contains(";")) {
            codeSignals++;
        }
        if (trimmed.contains(" = ") || trimmed.contains("==") || trimmed.contains("!=")) {
            codeSignals++;
        }
        if (trimmed.contains("<") && trimmed.contains(">")) {
            codeSignals++;
        }
        if (CODE_KEYWORD_PATTERN.matcher(trimmed).find()) {
            codeSignals++;
        }

        long symbolCount = trimmed.chars()
                .filter(ch -> "{}[]();<>=`/\\_".indexOf(ch) >= 0)
                .count();
        double symbolRatio = trimmed.isEmpty() ? 0 : (double) symbolCount / trimmed.length();
        if (isMostlyNaturalLanguage(trimmed) && codeSignals < 3) {
            return false;
        }

        return codeSignals >= 2 || symbolRatio > 0.12;
    }

    private boolean isMostlyNaturalLanguage(String text) {
        long letterCount = text.codePoints()
                .filter(Character::isLetter)
                .count();
        if (letterCount == 0) {
            return false;
        }
        long cjkCount = text.codePoints()
                .filter(ch -> Character.UnicodeScript.of(ch) == Character.UnicodeScript.HAN)
                .count();
        return cjkCount >= letterCount / 2;
    }

    private ChatModel requireChatModel() {
        ChatModel chatModel = chatModelProvider.getIfAvailable();
        if (chatModel == null) {
            throw AiServiceException.unavailable();
        }
        return chatModel;
    }

    private Prompt buildPrompt(List<AiChatTurn> history) {
        return buildPrompt(history, false);
    }

    private Prompt buildPrompt(List<AiChatTurn> history, boolean webSearch) {
        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(hoshiAiProperties.buildSystemPrompt(webSearch)));
        for (AiChatTurn turn : history) {
            if (!StringUtils.hasText(turn.content())) {
                continue;
            }
            if ("user".equalsIgnoreCase(turn.role())) {
                messages.add(new UserMessage(turn.content().trim()));
            } else if ("assistant".equalsIgnoreCase(turn.role())) {
                messages.add(new AssistantMessage(turn.content().trim()));
            }
        }
        if (messages.size() <= 1) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "没有可发送的对话内容");
        }
        ChatOptions chatOptions = buildWebSearchChatOptions(webSearch);
        if (chatOptions == null) {
            return new Prompt(messages);
        }
        return new Prompt(messages, chatOptions);
    }

    private ChatOptions buildWebSearchChatOptions(boolean webSearch) {
        if (!webSearch || !hoshiAiProperties.isWebSearchEnabled()) {
            return null;
        }
        return OpenAiChatOptions.builder()
                .model(chatModel)
                .extraBody(hoshiAiProperties.buildWebSearchExtraBody(webSearch, chatModel))
                .build();
    }

    private String rootCauseMessage(Throwable ex) {
        Throwable current = ex;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current.getMessage() != null ? current.getMessage() : ex.toString();
    }

    private String toDelta(ChatResponse chunk, AtomicReference<String> accumulated) {
        String current = extractChunkText(chunk);
        if (!StringUtils.hasText(current)) {
            return null;
        }

        String previous = accumulated.get();
        String delta;
        if (current.startsWith(previous)) {
            delta = current.substring(previous.length());
            accumulated.set(current);
        } else {
            delta = current;
            accumulated.updateAndGet(existing -> existing + current);
        }
        return StringUtils.hasText(delta) ? delta : null;
    }

    private String extractChunkText(ChatResponse chunk) {
        if (chunk.getResult() != null && chunk.getResult().getOutput() != null) {
            String text = chunk.getResult().getOutput().getText();
            if (StringUtils.hasText(text)) {
                return text;
            }
        }
        StringBuilder builder = new StringBuilder();
        for (Generation generation : chunk.getResults()) {
            if (generation.getOutput() == null) {
                continue;
            }
            String text = generation.getOutput().getText();
            if (StringUtils.hasText(text)) {
                builder.append(text);
            }
        }
        return builder.isEmpty() ? null : builder.toString();
    }
}
