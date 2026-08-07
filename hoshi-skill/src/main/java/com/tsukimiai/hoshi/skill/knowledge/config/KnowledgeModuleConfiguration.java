package com.tsukimiai.hoshi.skill.knowledge.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(KnowledgeChunkProperties.class)
public class KnowledgeModuleConfiguration {
}
