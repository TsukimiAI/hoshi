package com.tsukimiai.hoshi.conversation.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
        ProactiveConversationProperties.class,
        MemoryReconciliationProperties.class,
        KnowledgeSkillProperties.class})
public class ConversationModuleConfiguration {
}
