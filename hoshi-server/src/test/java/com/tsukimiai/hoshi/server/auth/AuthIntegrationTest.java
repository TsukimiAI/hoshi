package com.tsukimiai.hoshi.server.auth;

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import(AuthIntegrationTest.InMemoryBlacklistConfig.class)
@Transactional
class AuthIntegrationTest {

    private static final String USERNAME = "testuser";
    private static final String EMAIL = "test@example.com";
    private static final String PASSWORD = "password123";

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper();

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

    @BeforeEach
    void seedUser() {
        chatMessageSegmentMapper.delete(null);
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
    void loginAndFetchCurrentUser() throws Exception {
        String accessToken = loginAndGetAccessToken();

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.username").value(USERNAME))
                .andExpect(jsonPath("$.data.email").value(EMAIL));
    }

    @Test
    void loginRejectsWrongPassword() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "usernameOrEmail": "%s",
                                  "password": "wrong-password"
                                }
                                """.formatted(USERNAME)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40101));
    }

    @Test
    void logoutBlacklistsAccessTokenAndRevokesRefreshToken() throws Exception {
        JsonNode loginBody = objectMapper.readTree(login().andReturn().getResponse().getContentAsString());
        String accessToken = loginBody.path("data").path("accessToken").asText();
        String refreshToken = loginBody.path("data").path("refreshToken").asText();

        mockMvc.perform(post("/api/v1/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + accessToken)
                        .content("""
                                {
                                  "refreshToken": "%s"
                                }
                                """.formatted(refreshToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "refreshToken": "%s"
                                }
                                """.formatted(refreshToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40102));
    }

    @Test
    void refreshIssuesNewSession() throws Exception {
        String refreshToken = objectMapper.readTree(login().andReturn().getResponse().getContentAsString())
                .path("data")
                .path("refreshToken")
                .asText();

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "refreshToken": "%s"
                                }
                                """.formatted(refreshToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.data.refreshToken").isNotEmpty());
    }

    @Test
    void meRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    private String loginAndGetAccessToken() throws Exception {
        return objectMapper.readTree(login().andReturn().getResponse().getContentAsString())
                .path("data")
                .path("accessToken")
                .asText();
    }

    private org.springframework.test.web.servlet.ResultActions login() throws Exception {
        return mockMvc.perform(post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "usernameOrEmail": "%s",
                          "password": "%s"
                        }
                        """.formatted(USERNAME, PASSWORD)));
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
