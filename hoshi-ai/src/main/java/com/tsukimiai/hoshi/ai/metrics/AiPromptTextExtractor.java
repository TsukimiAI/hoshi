package com.tsukimiai.hoshi.ai.metrics;

import java.util.List;

import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.util.StringUtils;

public final class AiPromptTextExtractor {

    private AiPromptTextExtractor() {
    }

    public static String extract(Prompt prompt) {
        if (prompt == null) {
            return "";
        }
        List<Message> messages = prompt.getInstructions();
        if (messages == null || messages.isEmpty()) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        for (Message message : messages) {
            if (message == null) {
                continue;
            }
            String text = message.getText();
            if (!StringUtils.hasText(text)) {
                continue;
            }
            if (!builder.isEmpty()) {
                builder.append('\n');
            }
            builder.append(text.trim());
        }
        return builder.toString();
    }
}

