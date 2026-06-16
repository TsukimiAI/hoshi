package com.tsukimiai.hoshi.server.auth;

import java.time.LocalDateTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageSegmentMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.mapper.UserMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import(AuthIntegrationTest.InMemoryBlacklistConfig.class)
@Transactional
class UserProfileIntegrationTest {

    private static final byte[] PNG_HEADER =
            new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};

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
    void updateProfileChangesUsername() throws Exception {
        String accessToken = loginAndGetAccessToken();

        mockMvc.perform(patch("/api/v1/users/me")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "newname"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.username").value("newname"));
    }

    @Test
    void updateProfileRejectsDuplicateUsername() throws Exception {
        LocalDateTime now = LocalDateTime.now();
        User other = new User();
        other.setUsername("taken");
        other.setEmail("taken@example.com");
        other.setPasswordHash(passwordEncoder.encode(PASSWORD));
        other.setStatus(1);
        other.setEmailVerified(1);
        other.setEmailVerifiedAt(now);
        other.setCreatedAt(now);
        other.setUpdatedAt(now);
        userMapper.insert(other);

        String accessToken = loginAndGetAccessToken();

        mockMvc.perform(patch("/api/v1/users/me")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "taken"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40901));
    }

    @Test
    void uploadAvatarReturnsAvatarUrl() throws Exception {
        String accessToken = loginAndGetAccessToken();
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "avatar.png",
                "image/png",
                PNG_HEADER);

        mockMvc.perform(multipart("/api/v1/users/me/avatar")
                        .file(file)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.avatarUrl").isNotEmpty());
    }

    @Test
    void getAvatarContentReturnsImageBytes() throws Exception {
        String accessToken = loginAndGetAccessToken();
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "avatar.png",
                "image/png",
                PNG_HEADER);

        mockMvc.perform(multipart("/api/v1/users/me/avatar")
                        .file(file)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/users/me/avatar/content")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Type", "image/png"))
                .andExpect(content().bytes(PNG_HEADER));
    }

    @Test
    void getAvatarContentRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/avatar/content"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getAvatarContentReturnsNotFoundWhenAvatarMissing() throws Exception {
        String accessToken = loginAndGetAccessToken();

        mockMvc.perform(get("/api/v1/users/me/avatar/content")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40400));
    }

    @Test
    void getAvatarContentReturnsNotFoundAfterDelete() throws Exception {
        String accessToken = loginAndGetAccessToken();
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "avatar.png",
                "image/png",
                PNG_HEADER);

        mockMvc.perform(multipart("/api/v1/users/me/avatar")
                        .file(file)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/v1/users/me/avatar")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/users/me/avatar/content")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40400));
    }

    @Test
    void getAvatarContentForUserIdReturnsImageBytes() throws Exception {
        String accessToken = loginAndGetAccessToken();
        User user = userMapper.selectOne(Wrappers.<User>lambdaQuery().eq(User::getUsername, USERNAME));
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "avatar.png",
                "image/png",
                PNG_HEADER);

        mockMvc.perform(multipart("/api/v1/users/me/avatar")
                        .file(file)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/users/{userId}/avatar/content", user.getId())
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Type", "image/png"))
                .andExpect(content().bytes(PNG_HEADER));
    }

    @Test
    void deleteAvatarClearsAvatarUrlInDatabase() throws Exception {
        String accessToken = loginAndGetAccessToken();
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "avatar.png",
                "image/png",
                PNG_HEADER);

        mockMvc.perform(multipart("/api/v1/users/me/avatar")
                        .file(file)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/v1/users/me/avatar")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.avatarUrl").isEmpty());

        User user = userMapper.selectOne(Wrappers.<User>lambdaQuery().eq(User::getUsername, USERNAME));
        assertThat(user).isNotNull();
        assertThat(user.getAvatarUrl()).isNull();
    }

    @Test
    void changePasswordRejectsWrongCurrentPassword() throws Exception {
        String accessToken = loginAndGetAccessToken();

        mockMvc.perform(post("/api/v1/auth/change-password")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "currentPassword": "wrong-password",
                                  "newPassword": "newpassword123"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40101));
    }

    @Test
    void changePasswordUpdatesPassword() throws Exception {
        String accessToken = loginAndGetAccessToken();

        mockMvc.perform(post("/api/v1/auth/change-password")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "currentPassword": "%s",
                                  "newPassword": "newpassword123"
                                }
                                """.formatted(PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "usernameOrEmail": "%s",
                                  "password": "newpassword123"
                                }
                                """.formatted(USERNAME)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));
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

}
