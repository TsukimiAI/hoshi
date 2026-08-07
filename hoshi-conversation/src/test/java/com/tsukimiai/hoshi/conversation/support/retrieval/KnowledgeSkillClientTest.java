package com.tsukimiai.hoshi.conversation.support.retrieval;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.tsukimiai.hoshi.skill.api.SkillApiPaths;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveRequest;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveResponse;

class KnowledgeSkillClientTest {

    private MockRestServiceServer server;
    private KnowledgeSkillClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://skill.test");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new KnowledgeSkillClient(builder.build());
    }

    @Test
    void retrievePostsRequestAndParsesResponse() {
        server.expect(requestTo("http://skill.test" + SkillApiPaths.KNOWLEDGE_RETRIEVE))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(SkillApiPaths.API_VERSION_HEADER, SkillApiPaths.API_VERSION))
                .andExpect(content().json("""
                        {
                          "userId": 1,
                          "query": "Spring Boot",
                          "topK": 8,
                          "budgetTokens": 400,
                          "minScore": 0.6
                        }
                        """))
                .andRespond(withSuccess("""
                        {
                          "chunks": [
                            {
                              "title": "笔记",
                              "content": "可以用分层方式组织项目。",
                              "source": "kb:doc-1",
                              "score": 0.82
                            }
                          ]
                        }
                        """, MediaType.APPLICATION_JSON));

        KnowledgeRetrieveResponse response = client.retrieve(
                new KnowledgeRetrieveRequest(1L, "Spring Boot", 8, 400, 0.6));

        assertThat(response.chunks()).hasSize(1);
        assertThat(response.chunks().get(0).content()).contains("分层方式");
        server.verify();
    }
}
