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
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageSegmentMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.mapper.UserMemoryMapper;
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
@Import(UserMemoryIntegrationTest.InMemoryBlacklistConfig.class)
@Transactional
class UserMemoryIntegrationTest {

    private static final String USERNAME = "memoryuser";
    private static final String EMAIL = "memory@example.com";
    private static final String PASSWORD = "password123";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private UserMemoryMapper userMemoryMapper;

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
    void seedUser() {
        chatMessageSegmentMapper.delete(null);
        chatMessageMapper.delete(null);
        chatSessionMapper.delete(null);
        userMemoryMapper.delete(null);
        userMapper.delete(null);
        insertUser(USERNAME, EMAIL, PASSWORD);
    }

    @Test
    void listMemoriesReturnsEmptyListInitially() throws Exception {
        mockMvc.perform(get("/api/v1/memories")
                        .header("Authorization", "Bearer " + loginAndGetAccessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void createUpdateAndDeleteMemory() throws Exception {
        String accessToken = loginAndGetAccessToken();

        String createResponse = mockMvc.perform(post("/api/v1/memories")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "content": "老师更喜欢后端开发",
                                  "category": "preference",
                                  "alwaysPinned": true
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.content").value("老师更喜欢后端开发"))
                .andExpect(jsonPath("$.data.memoryType").value("long"))
                .andExpect(jsonPath("$.data.category").value("preference"))
                .andExpect(jsonPath("$.data.alwaysPinned").value(true))
                .andReturn()
                .getResponse()
                .getContentAsString();

        String memoryId = objectMapper.readTree(createResponse).path("data").path("id").asText();

        mockMvc.perform(get("/api/v1/memories")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].id").value(memoryId));

        mockMvc.perform(patch("/api/v1/memories/{id}", memoryId)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "content": "老师更喜欢 Java 后端开发"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value("老师更喜欢 Java 后端开发"));

        mockMvc.perform(delete("/api/v1/memories/{id}", memoryId)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/memories")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void recentMemoriesReturnsCreatedEvent() throws Exception {
        String accessToken = loginAndGetAccessToken();
        LocalDateTime since = LocalDateTime.now().minusSeconds(1);

        mockMvc.perform(post("/api/v1/memories")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "content": "老师叫 Hanami",
                                  "category": "identity"
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/memories/recent")
                        .param("since", since.toString())
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].eventType").value("created"))
                .andExpect(jsonPath("$.data[0].content").value("老师叫 Hanami"));
    }

    @Test
    void recentMemoriesReturnsPromotedEvent() throws Exception {
        String accessToken = loginAndGetAccessToken();
        Long userId = userMapper.selectList(null).get(0).getId();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime since = now.minusSeconds(1);

        UserMemory promotedShort = new UserMemory();
        promotedShort.setUserId(userId);
        promotedShort.setMemoryType("short");
        promotedShort.setCategory("current_focus");
        promotedShort.setContent("老师最近在准备聊天功能");
        promotedShort.setTemporalScope("ongoing");
        promotedShort.setConfidence(0.9);
        promotedShort.setImportanceScore(0.8);
        promotedShort.setStrengthScore(0.8);
        promotedShort.setHalfLifeHours(24);
        promotedShort.setAccessCount(3);
        promotedShort.setAlwaysPinned(0);
        promotedShort.setStatus("promoted");
        promotedShort.setLastReinforcedAt(now);
        promotedShort.setCreatedAt(now.minusDays(1));
        promotedShort.setUpdatedAt(now);
        userMemoryMapper.insert(promotedShort);

        UserMemory promotedLong = new UserMemory();
        promotedLong.setUserId(userId);
        promotedLong.setMemoryType("long");
        promotedLong.setCategory("preference");
        promotedLong.setContent("老师最近在准备聊天功能");
        promotedLong.setTemporalScope("stable");
        promotedLong.setConfidence(0.9);
        promotedLong.setImportanceScore(0.8);
        promotedLong.setStrengthScore(1.0);
        promotedLong.setAccessCount(3);
        promotedLong.setAlwaysPinned(0);
        promotedLong.setStatus("active");
        promotedLong.setLastReinforcedAt(now);
        promotedLong.setCreatedAt(now);
        promotedLong.setUpdatedAt(now);
        userMemoryMapper.insert(promotedLong);

        mockMvc.perform(get("/api/v1/memories/recent")
                        .param("since", since.toString())
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].eventType").value("promoted"))
                .andExpect(jsonPath("$.data[0].category").value("preference"));
    }

    @Test
    void listMemoriesIncludesShortAndLongTermMemories() throws Exception {
        String accessToken = loginAndGetAccessToken();
        Long userId = userMapper.selectList(null).get(0).getId();
        LocalDateTime now = LocalDateTime.now();

        UserMemory shortMemory = new UserMemory();
        shortMemory.setUserId(userId);
        shortMemory.setMemoryType("short");
        shortMemory.setCategory("current_focus");
        shortMemory.setContent("老师最近在准备聊天功能");
        shortMemory.setTemporalScope("ongoing");
        shortMemory.setConfidence(0.9);
        shortMemory.setImportanceScore(0.8);
        shortMemory.setStrengthScore(0.8);
        shortMemory.setHalfLifeHours(24);
        shortMemory.setAccessCount(1);
        shortMemory.setAlwaysPinned(0);
        shortMemory.setStatus("active");
        shortMemory.setLastReinforcedAt(now);
        shortMemory.setCreatedAt(now);
        shortMemory.setUpdatedAt(now);
        userMemoryMapper.insert(shortMemory);

        mockMvc.perform(post("/api/v1/memories")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "content": "老师更喜欢后端开发",
                                  "category": "preference"
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/memories")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].memoryType").value("long"))
                .andExpect(jsonPath("$.data[1].memoryType").value("short"))
                .andExpect(jsonPath("$.data[1].category").value("current_focus"));

        mockMvc.perform(get("/api/v1/memories")
                        .param("category", "current_focus")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].memoryType").value("short"));

        mockMvc.perform(delete("/api/v1/memories/{id}", shortMemory.getId())
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk());
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
