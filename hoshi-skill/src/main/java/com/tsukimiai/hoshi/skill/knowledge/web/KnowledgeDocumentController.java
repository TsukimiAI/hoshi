package com.tsukimiai.hoshi.skill.knowledge.web;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.tsukimiai.hoshi.common.api.ApiResponse;
import com.tsukimiai.hoshi.skill.knowledge.dto.KnowledgeDocumentResponse;
import com.tsukimiai.hoshi.skill.knowledge.service.KnowledgeAdminService;
import com.tsukimiai.hoshi.skill.knowledge.service.KnowledgeDocumentService;
import com.tsukimiai.hoshi.skill.knowledge.service.KnowledgeIndexingDispatcher;

@RestController
public class KnowledgeDocumentController {

    private final KnowledgeDocumentService knowledgeDocumentService;
    private final KnowledgeIndexingDispatcher indexingDispatcher;
    private final KnowledgeAdminService adminService;

    public KnowledgeDocumentController(
            KnowledgeDocumentService knowledgeDocumentService,
            KnowledgeIndexingDispatcher indexingDispatcher,
            KnowledgeAdminService adminService) {
        this.knowledgeDocumentService = knowledgeDocumentService;
        this.indexingDispatcher = indexingDispatcher;
        this.adminService = adminService;
    }

    @PostMapping(value = "/v1/skills/knowledge/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<KnowledgeDocumentResponse> upload(
            @RequestParam("userId") Long userId,
            @RequestPart("file") MultipartFile file) {
        var uploaded = knowledgeDocumentService.upload(userId, file);
        knowledgeDocumentService.markIndexing(uploaded.getId());
        indexingDispatcher.enqueue(userId, uploaded.getId());
        return ApiResponse.ok(KnowledgeDocumentResponse.from(knowledgeDocumentService.get(userId, uploaded.getId())));
    }

    @GetMapping("/v1/skills/knowledge/documents/{id}")
    public ApiResponse<KnowledgeDocumentResponse> get(
            @RequestParam("userId") Long userId,
            @PathVariable("id") Long id) {
        return ApiResponse.ok(KnowledgeDocumentResponse.from(knowledgeDocumentService.get(userId, id)));
    }

    @GetMapping("/v1/skills/knowledge/documents")
    public ApiResponse<java.util.List<KnowledgeDocumentResponse>> list(
            @RequestParam("userId") Long userId,
            @RequestParam(value = "limit", required = false, defaultValue = "50") int limit) {
        var docs = knowledgeDocumentService.list(userId, limit).stream()
                .map(KnowledgeDocumentResponse::from)
                .toList();
        return ApiResponse.ok(docs);
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/v1/skills/knowledge/documents/{id}")
    public ApiResponse<Void> delete(
            @RequestParam("userId") Long userId,
            @PathVariable("id") Long id) {
        adminService.delete(userId, id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/v1/skills/knowledge/documents/{id}/reindex")
    public ApiResponse<KnowledgeDocumentResponse> reindex(
            @RequestParam("userId") Long userId,
            @PathVariable("id") Long id) {
        return ApiResponse.ok(KnowledgeDocumentResponse.from(adminService.reindex(userId, id)));
    }
}

