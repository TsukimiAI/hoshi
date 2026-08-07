package com.tsukimiai.hoshi.skill.knowledge.service;

import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.skill.knowledge.config.KnowledgeChunkProperties;
import com.tsukimiai.hoshi.skill.knowledge.support.MarkdownStructureChunker;

@Service
public class KnowledgeDocumentSummarizer {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeDocumentSummarizer.class);

    private final ObjectProvider<ChatModel> chatModelProvider;
    private final KnowledgeChunkProperties properties;

    public KnowledgeDocumentSummarizer(ObjectProvider<ChatModel> chatModelProvider, KnowledgeChunkProperties properties) {
        this.chatModelProvider = chatModelProvider;
        this.properties = properties;
    }

    public String summarize(String docTitle, String rawText, List<String> headingPaths) {
        if (!properties.getSummary().isEnabled()) {
            return buildOutlineSummary(docTitle, headingPaths, rawText);
        }
        ChatModel chatModel = chatModelProvider.getIfAvailable();
        if (chatModel == null) {
            return buildOutlineSummary(docTitle, headingPaths, rawText);
        }
        try {
            String prompt = buildPrompt(docTitle, headingPaths, rawText);
            var response = chatModel.call(new Prompt(
                    prompt,
                    OpenAiChatOptions.builder()
                            .model(properties.getSummary().getModel())
                            .temperature(0.2)
                            .build()));
            String summary = response.getResult().getOutput().getText();
            if (StringUtils.hasText(summary)) {
                return summary.trim();
            }
        } catch (Exception ex) {
            log.warn("Document summary generation failed for '{}': {}", docTitle, ex.getMessage());
            log.debug("Document summary failure details", ex);
        }
        return buildOutlineSummary(docTitle, headingPaths, rawText);
    }

    String buildOutlineSummary(String docTitle, List<String> headingPaths, String rawText) {
        StringBuilder builder = new StringBuilder();
        builder.append("文档《").append(StringUtils.hasText(docTitle) ? docTitle : "未命名").append("》大纲摘要。\n");
        if (headingPaths != null && !headingPaths.isEmpty()) {
            builder.append("章节：\n");
            for (String heading : headingPaths) {
                if (StringUtils.hasText(heading)) {
                    builder.append("- ").append(heading.trim()).append('\n');
                }
            }
        }
        String excerpt = truncate(rawText, 500);
        if (StringUtils.hasText(excerpt)) {
            builder.append("正文摘录：").append(excerpt);
        }
        return builder.toString().trim();
    }

    private String buildPrompt(String docTitle, List<String> headingPaths, String rawText) {
        String outline = headingPaths == null || headingPaths.isEmpty()
                ? "（无明确章节标题）"
                : headingPaths.stream()
                        .filter(StringUtils::hasText)
                        .map(path -> "- " + path.trim())
                        .collect(Collectors.joining("\n"));
        String body = truncate(rawText, properties.getSummary().getMaxInputChars());
        return """
                你是技术文档摘要助手。请根据标题大纲和正文，生成 300-500 字结构化摘要。
                要求：
                1. 先给出文档主题一句话概括
                2. 按章节列出要点，每章 1 句话
                3. 使用中文，避免空话

                文档标题：%s

                章节大纲：
                %s

                正文（可能截断）：
                %s
                """.formatted(
                StringUtils.hasText(docTitle) ? docTitle : "未命名文档",
                outline,
                body);
    }

    private String truncate(String text, int maxChars) {
        if (!StringUtils.hasText(text) || maxChars <= 0) {
            return "";
        }
        String trimmed = text.trim();
        if (trimmed.length() <= maxChars) {
            return trimmed;
        }
        return trimmed.substring(0, maxChars);
    }
}
