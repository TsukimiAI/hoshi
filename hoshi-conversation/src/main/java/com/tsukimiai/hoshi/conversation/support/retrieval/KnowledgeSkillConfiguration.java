package com.tsukimiai.hoshi.conversation.support.retrieval;

import java.net.Proxy;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import com.tsukimiai.hoshi.conversation.config.KnowledgeSkillProperties;
import com.tsukimiai.hoshi.skill.api.SkillApiPaths;

@Configuration
@EnableConfigurationProperties(KnowledgeSkillProperties.class)
@Conditional(KnowledgeSkillEnabledCondition.class)
public class KnowledgeSkillConfiguration {

    @Bean
    RestClient knowledgeSkillRestClient(KnowledgeSkillProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setProxy(Proxy.NO_PROXY);
        int timeoutMs = Math.max(properties.getTimeoutMs(), 1000);
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);

        RestClient.Builder builder = RestClient.builder()
                .baseUrl(properties.getResolvedBaseUrl())
                .requestFactory(requestFactory)
                .defaultHeader(SkillApiPaths.API_VERSION_HEADER, SkillApiPaths.API_VERSION);
        if (StringUtils.hasText(properties.getAuthToken())) {
            builder.defaultHeader("Authorization", "Bearer " + properties.getAuthToken().trim());
        }
        return builder.build();
    }

    @Bean
    KnowledgeSkillClient knowledgeSkillClient(RestClient knowledgeSkillRestClient) {
        return new KnowledgeSkillClient(knowledgeSkillRestClient);
    }

    @Bean
    KnowledgeRetriever httpKnowledgeRetriever(
            KnowledgeSkillClient knowledgeSkillClient,
            com.tsukimiai.hoshi.ai.config.HoshiAiRagProperties ragProperties) {
        return new HttpKnowledgeRetriever(knowledgeSkillClient, ragProperties);
    }
}
