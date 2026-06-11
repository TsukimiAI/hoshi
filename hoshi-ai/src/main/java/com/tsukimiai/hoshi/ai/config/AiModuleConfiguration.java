package com.tsukimiai.hoshi.ai.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(HoshiAiProperties.class)
public class AiModuleConfiguration {
}
