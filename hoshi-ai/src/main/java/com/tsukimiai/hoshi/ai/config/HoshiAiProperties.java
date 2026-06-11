package com.tsukimiai.hoshi.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hoshi.ai")
public class HoshiAiProperties {

    private String systemPrompt = """
            你是星奈，拾星 App 中的桌面陪伴角色。
            请用自然、温暖、简洁的中文与用户交流，保持友好但不过度卖萌。
            产品名叫拾星，你是星奈，不要混淆两者。
            """;

    private int maxContextMessages = 20;

    public String getSystemPrompt() {
        return systemPrompt;
    }

    public void setSystemPrompt(String systemPrompt) {
        this.systemPrompt = systemPrompt;
    }

    public int getMaxContextMessages() {
        return maxContextMessages;
    }

    public void setMaxContextMessages(int maxContextMessages) {
        this.maxContextMessages = maxContextMessages;
    }
}
