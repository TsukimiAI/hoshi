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
import com.tsukimiai.hoshi.common.message.XingnaiMessages;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.security.jwt.JwtBlacklistService;
import com.tsukimiai.hoshi.server.support.FailingMockChatModelConfiguration;
import com.tsukimiai.hoshi.server.support.InMemoryJwtBlacklistService;
import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.mapper.UserMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import({ChatMessageStreamErrorIntegrationTest.InMemoryBlacklistConfig.class, FailingMockChatModelConfiguration.class})
class ChatMessageStreamErrorIntegrationTest {

    private static final String USERNAME = "testuser";
    private static final String EMAIL = "test@example.com";
    private static final String PASSWORD = "password123";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private ChatMessageMapper chatMessageMapper;

    @Autowired
    private ChatSessionMapper chatSessionMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

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
    void sendMessageReturnsFriendlyAiErrorEvent() throws Exception {
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
                        .andReturn()
                        .getResponse()
                        .getContentAsByteArray(),
                StandardCharsets.UTF_8);

        assertThat(body).contains("event:user");
        assertThat(body).contains("event:error");
        assertThat(body).contains(XingnaiMessages.aiUnavailable());
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
