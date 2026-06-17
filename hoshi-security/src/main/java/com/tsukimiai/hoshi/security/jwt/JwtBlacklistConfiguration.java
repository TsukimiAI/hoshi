package com.tsukimiai.hoshi.security.jwt;

import org.springframework.boot.autoconfigure.AutoConfigureAfter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

import io.micrometer.core.instrument.MeterRegistry;

@Configuration
@AutoConfigureAfter(name = "org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration")
public class JwtBlacklistConfiguration {

    @Bean
    @ConditionalOnBean(StringRedisTemplate.class)
    public JwtBlacklistService redisJwtBlacklistService(
            StringRedisTemplate redisTemplate,
            ObjectProvider<MeterRegistry> meterRegistryProvider) {
        return new RedisJwtBlacklistService(redisTemplate, meterRegistryProvider.getIfAvailable());
    }

    @Bean
    @ConditionalOnMissingBean(JwtBlacklistService.class)
    public JwtBlacklistService noOpJwtBlacklistService() {
        return new NoOpJwtBlacklistService();
    }

}
