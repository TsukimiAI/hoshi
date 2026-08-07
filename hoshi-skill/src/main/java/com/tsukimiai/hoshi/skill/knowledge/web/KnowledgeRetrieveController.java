package com.tsukimiai.hoshi.skill.knowledge.web;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveRequest;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveResponse;
import com.tsukimiai.hoshi.skill.knowledge.service.KnowledgeRetrieveService;

@RestController
public class KnowledgeRetrieveController {

    private final KnowledgeRetrieveService retrieveService;

    public KnowledgeRetrieveController(KnowledgeRetrieveService retrieveService) {
        this.retrieveService = retrieveService;
    }

    @PostMapping("/v1/skills/knowledge/retrieve")
    public KnowledgeRetrieveResponse retrieve(@RequestBody KnowledgeRetrieveRequest request) {
        return retrieveService.retrieve(request);
    }
}

