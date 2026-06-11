package com.tsukimiai.hoshi.server.conversation;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.security.jwt.JwtBlacklistService;
import com.tsukimiai.hoshi.server.support.InMemoryJwtBlacklistService;
import com.tsukimiai.hoshi.server.support.MockChatModelConfiguration;
import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.mapper.UserMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import({ChatMessageIntegrationTest.InMemoryBlacklistConfig.class, MockChatModelConfiguration.class})
class ChatMessageIntegrationTest {

    private static final String USERNAME = "testuser";
    private static final String EMAIL = "test@example.com";
    private static final String PASSWORD = "password123";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ChatMessageMapper chatMessageMapper;

    @Autowired
    private ChatSessionMapper chatSessionMapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void seedUser() {
        chatMessageMapper.delete(null);
        chatSessionMapper.delete(null);
        userMapper.delete(null);

        LocalDateTime now = LocalDateTime.now();
        User user = new User();
        user.setUsername(USERNAME);
        user.setEmail(EMAIL);
        user.setPasswordHash(passwordEncoder.encode(PASSWORD));
        user.setStatus(1);
        user.setEmailVerified(1);
        user.setEmailVerifiedAt(now);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        userMapper.insert(user);
    }

    @Test
    void sendMessageStreamsUserAndAssistantReplies() throws Exception {
        String accessToken = loginAndGetAccessToken();
        String sessionId = objectMapper.readTree(mockMvc.perform(get("/api/v1/chat/sessions")
                        .header("Authorization", "Bearer " + accessToken))
                .andReturn()
                .getResponse()
                .getContentAsString())
                .path("data")
                .get(0)
                .path("id")
                .asText();

        String body = new String(
                mockMvc.perform(post("/api/v1/chat/sessions/{id}/messages", sessionId)
                                .header("Authorization", "Bearer " + accessToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .accept(MediaType.TEXT_EVENT_STREAM)
                                .content("""
                                        {
                                          "content": "你好，星奈"
                                        }
                                        """))
                        .andExpect(status().isOk())
                        .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
                        .andReturn()
                        .getResponse()
                        .getContentAsByteArray(),
                StandardCharsets.UTF_8);
        assertThat(body).contains("event:user");
        assertThat(body).contains("你好，星奈");
        assertThat(body).contains("event:delta");
        assertThat(body).contains("event:done");
        assertThat(body).contains("你好，我是星奈。测试回复。");

        mockMvc.perform(get("/api/v1/chat/sessions/{id}/messages", sessionId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2));
    }

    @Test
    void retryMessageRegeneratesAssistantReply() throws Exception {
        String accessToken = loginAndGetAccessToken();
        String sessionId = objectMapper.readTree(mockMvc.perform(get("/api/v1/chat/sessions")
                        .header("Authorization", "Bearer " + accessToken))
                .andReturn()
                .getResponse()
                .getContentAsString())
                .path("data")
                .get(0)
                .path("id")
                .asText();

        postMessage(accessToken, sessionId, "请再回答一次");
        chatMessageMapper.delete(new LambdaQueryWrapper<ChatMessage>()
                .eq(ChatMessage::getSessionId, Long.parseLong(sessionId))
                .eq(ChatMessage::getRole, "assistant"));

        String body = postRetry(accessToken, sessionId);
        assertThat(body).contains("event:delta");
        assertThat(body).contains("event:done");
        assertThat(body).contains("你好，我是星奈。测试回复。");

        mockMvc.perform(get("/api/v1/chat/sessions/{id}/messages", sessionId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2));
    }

    private String postMessage(String accessToken, String sessionId, String content) throws Exception {
        return new String(
                mockMvc.perform(post("/api/v1/chat/sessions/{id}/messages", sessionId)
                                .header("Authorization", "Bearer " + accessToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .accept(MediaType.TEXT_EVENT_STREAM)
                                .content("""
                                        {
                                          "content": "%s"
                                        }
                                        """.formatted(content)))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsByteArray(),
                StandardCharsets.UTF_8);
    }

    private String postRetry(String accessToken, String sessionId) throws Exception {
        return new String(
                mockMvc.perform(post("/api/v1/chat/sessions/{id}/messages/retry", sessionId)
                                .header("Authorization", "Bearer " + accessToken)
                                .accept(MediaType.TEXT_EVENT_STREAM))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsByteArray(),
                StandardCharsets.UTF_8);
    }

    private String loginAndGetAccessToken() throws Exception {
        return objectMapper.readTree(mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "usernameOrEmail": "%s",
                                  "password": "%s"
                                }
                                """.formatted(USERNAME, PASSWORD)))
                .andReturn()
                .getResponse()
                .getContentAsString())
                .path("data")
                .path("accessToken")
                .asText();
    }

    @TestConfiguration
    static class InMemoryBlacklistConfig {

        @Bean
        @Primary
        JwtBlacklistService inMemoryJwtBlacklistService() {
            return new InMemoryJwtBlacklistService();
        }
    }
}
