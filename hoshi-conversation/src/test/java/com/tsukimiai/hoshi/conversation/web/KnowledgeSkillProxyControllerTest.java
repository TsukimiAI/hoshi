package com.tsukimiai.hoshi.conversation.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.tsukimiai.hoshi.conversation.config.KnowledgeSkillProperties;
import com.tsukimiai.hoshi.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

@ExtendWith(MockitoExtension.class)
class KnowledgeSkillProxyControllerTest {

  private static final String SKILL_BASE = "http://skill.test";

  @Mock
  private CurrentUserResolver currentUserResolver;

  private MockRestServiceServer server;
  private KnowledgeSkillProxyController controller;

  @BeforeEach
  void setUp() {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    RestClient restClient = builder.build();

    KnowledgeSkillProperties properties = new KnowledgeSkillProperties();
    properties.setBaseUrl(SKILL_BASE);
    properties.setTimeoutMs(5000);
    properties.setUploadTimeoutMs(120000);

    User user = new User();
    user.setId(42L);
    lenient().when(currentUserResolver.requireCurrentUser()).thenReturn(user);

    controller = new KnowledgeSkillProxyController(properties, currentUserResolver, restClient, restClient);
  }

  @Test
  void listDocumentsForwardsCurrentUserId() {
    server.expect(requestTo(SKILL_BASE + "/v1/skills/knowledge/documents?userId=42&limit=10"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withSuccess("""
            {"code":0,"message":"ok","data":[{"id":1,"filename":"a.txt","status":"READY"}]}
            """, MediaType.APPLICATION_JSON));

    var response = controller.listDocuments(10);

    assertThat(response.code()).isZero();
    assertThat(response.data()).hasSize(1);
    assertThat(response.data().get(0).get("filename")).isEqualTo("a.txt");
    server.verify();
  }

  @Test
  void listDocumentsPropagatesSkillErrorCode() {
    server.expect(requestTo(SKILL_BASE + "/v1/skills/knowledge/documents?userId=42&limit=50"))
        .andExpect(method(HttpMethod.GET))
        .andRespond(withSuccess("""
            {"code":40001,"message":"bad request","data":[]}
            """, MediaType.APPLICATION_JSON));

    var response = controller.listDocuments(50);

    assertThat(response.code()).isEqualTo(40001);
    assertThat(response.message()).isEqualTo("bad request");
    server.verify();
  }

  @Test
  void uploadDocumentForwardsMultipartToSkill() throws Exception {
    server.expect(requestTo(SKILL_BASE + "/v1/skills/knowledge/documents?userId=42"))
        .andExpect(method(HttpMethod.POST))
        .andRespond(withSuccess("""
            {"code":0,"message":"ok","data":{"id":9,"filename":"note.md","status":"INDEXING"}}
            """, MediaType.APPLICATION_JSON));

    MockMultipartFile file =
        new MockMultipartFile("file", "note.md", "text/markdown", "# hello".getBytes());

    var response = controller.uploadDocument(file);

    assertThat(response.code()).isZero();
    assertThat(response.data()).containsEntry("id", 9);
    assertThat(response.data()).containsEntry("status", "INDEXING");
    server.verify();
  }

  @Test
  void deleteDocumentForwardsToSkill() {
    server.expect(requestTo(SKILL_BASE + "/v1/skills/knowledge/documents/9?userId=42"))
        .andExpect(method(HttpMethod.DELETE))
        .andRespond(withSuccess("""
            {"code":0,"message":"ok","data":null}
            """, MediaType.APPLICATION_JSON));

    var response = controller.deleteDocument(9L);

    assertThat(response.code()).isZero();
    server.verify();
  }

  @Test
  void resolveSkillBaseUrlFallsBackWhenBlank() {
    assertThat(KnowledgeSkillProxyController.resolveSkillBaseUrl(null))
        .isEqualTo("http://localhost:8090");
    assertThat(KnowledgeSkillProxyController.resolveSkillBaseUrl("  "))
        .isEqualTo("http://localhost:8090");
    assertThat(KnowledgeSkillProxyController.resolveSkillBaseUrl("http://skill:8090/"))
        .isEqualTo("http://skill:8090");
  }
}
