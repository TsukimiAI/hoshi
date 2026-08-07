package com.tsukimiai.hoshi.conversation.support.retrieval;

import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.tsukimiai.hoshi.skill.api.SkillApiPaths;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveRequest;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveResponse;

public class KnowledgeSkillClient {

    private final RestClient restClient;

    public KnowledgeSkillClient(RestClient restClient) {
        this.restClient = restClient;
    }

    public KnowledgeRetrieveResponse retrieve(KnowledgeRetrieveRequest request) {
        try {
            KnowledgeRetrieveResponse response = restClient.post()
                    .uri(SkillApiPaths.KNOWLEDGE_RETRIEVE)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header(SkillApiPaths.API_VERSION_HEADER, SkillApiPaths.API_VERSION)
                    .body(request)
                    .retrieve()
                    .body(KnowledgeRetrieveResponse.class);
            return response == null ? new KnowledgeRetrieveResponse(java.util.List.of()) : response;
        } catch (RestClientException ex) {
            throw new KnowledgeSkillClientException("Knowledge skill request failed", ex);
        }
    }
}
