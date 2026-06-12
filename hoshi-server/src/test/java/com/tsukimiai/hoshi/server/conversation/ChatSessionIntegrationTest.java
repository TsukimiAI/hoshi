package com.tsukimiai.hoshi.server.conversation;

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
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageSegmentMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.security.jwt.JwtBlacklistService;
import com.tsukimiai.hoshi.server.support.InMemoryJwtBlacklistService;
import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.mapper.UserMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import(ChatSessionIntegrationTest.InMemoryBlacklistConfig.class)
@Transactional
class ChatSessionIntegrationTest {

    private static final String USERNAME = "testuser";
    private static final String EMAIL = "test@example.com";
    private static final String PASSWORD = "password123";

    private static final String OTHER_USERNAME = "otheruser";
    private static final String OTHER_EMAIL = "other@example.com";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private ChatMessageSegmentMapper chatMessageSegmentMapper;

    @Autowired
    private ChatMessageMapper chatMessageMapper;

    @Autowired
    private ChatSessionMapper chatSessionMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void seedUsers() {
        chatMessageSegmentMapper.delete(null);
        chatMessageMapper.delete(null);
        chatSessionMapper.delete(null);
        userMapper.delete(null);

        insertUser(USERNAME, EMAIL, PASSWORD);
        insertUser(OTHER_USERNAME, OTHER_EMAIL, PASSWORD);
    }

    @Test
    void listSessionsCreatesDefaultSessionWhenEmpty() throws Exception {
        mockMvc.perform(get("/api/v1/chat/sessions")
                        .header("Authorization", "Bearer " + loginAndGetAccessToken(USERNAME)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].title").value("和星奈"));
    }

    @Test
    void createSessionAddsSessionToTopOfList() throws Exception {
        String accessToken = loginAndGetAccessToken(USERNAME);

        mockMvc.perform(get("/api/v1/chat/sessions")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/chat/sessions")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "注册流程讨论"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("注册流程讨论"));

        mockMvc.perform(get("/api/v1/chat/sessions")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].title").value("注册流程讨论"))
                .andExpect(jsonPath("$.data[1].title").value("和星奈"));
    }

    @Test
    void updateTitleRejectsAnotherUsersSession() throws Exception {
        String accessToken = loginAndGetAccessToken(USERNAME);
        String otherAccessToken = loginAndGetAccessToken(OTHER_USERNAME);

        JsonNode created = createSession(accessToken, "原始标题");
        String sessionId = created.path("data").path("id").asText();

        mockMvc.perform(patch("/api/v1/chat/sessions/{id}", sessionId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "更新后的标题"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("更新后的标题"));

        mockMvc.perform(patch("/api/v1/chat/sessions/{id}", sessionId)
                        .header("Authorization", "Bearer " + otherAccessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "越权修改"
                                }
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40302));
    }

    @Test
    void deleteSessionRejectsAnotherUsersSession() throws Exception {
        String accessToken = loginAndGetAccessToken(USERNAME);
        String otherAccessToken = loginAndGetAccessToken(OTHER_USERNAME);

        JsonNode created = createSession(accessToken, "待删除会话");
        String sessionId = created.path("data").path("id").asText();

        mockMvc.perform(delete("/api/v1/chat/sessions/{id}", sessionId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));

        JsonNode otherCreated = createSession(accessToken, "另一个会话");
        String otherSessionId = otherCreated.path("data").path("id").asText();

        mockMvc.perform(delete("/api/v1/chat/sessions/{id}", otherSessionId)
                        .header("Authorization", "Bearer " + otherAccessToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(40302));
    }

    private void insertUser(String username, String email, String password) {
        LocalDateTime now = LocalDateTime.now();
        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setStatus(1);
        user.setEmailVerified(1);
        user.setEmailVerifiedAt(now);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        userMapper.insert(user);
    }

    private String loginAndGetAccessToken(String username) throws Exception {
        return objectMapper.readTree(mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "usernameOrEmail": "%s",
                                  "password": "%s"
                                }
                                """.formatted(username, PASSWORD)))
                .andReturn()
                .getResponse()
                .getContentAsString())
                .path("data")
                .path("accessToken")
                .asText();
    }

    private JsonNode createSession(String accessToken, String title) throws Exception {
        return objectMapper.readTree(mockMvc.perform(post("/api/v1/chat/sessions")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "%s"
                                }
                                """.formatted(title)))
                .andReturn()
                .getResponse()
                .getContentAsString());
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
