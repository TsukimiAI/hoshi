package com.tsukimiai.hoshi.user.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({
        HoshiMailProperties.class,
        HoshiAppProperties.class,
        HoshiAuthProperties.class
})
public class UserModuleConfiguration {

}
