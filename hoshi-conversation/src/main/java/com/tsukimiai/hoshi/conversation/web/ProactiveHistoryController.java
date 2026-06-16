package com.tsukimiai.hoshi.conversation.web;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.tsukimiai.hoshi.common.api.ApiResponse;
import com.tsukimiai.hoshi.conversation.dto.ProactiveHistoryResponse;
import com.tsukimiai.hoshi.conversation.service.ProactiveHistoryService;
import com.tsukimiai.hoshi.user.entity.User;

@RestController
@RequestMapping("/api/v1/proactive")
public class ProactiveHistoryController {

    private final ProactiveHistoryService proactiveHistoryService;
    private final CurrentUserResolver currentUserResolver;

    public ProactiveHistoryController(
            ProactiveHistoryService proactiveHistoryService,
            CurrentUserResolver currentUserResolver) {
        this.proactiveHistoryService = proactiveHistoryService;
        this.currentUserResolver = currentUserResolver;
    }

    @GetMapping("/history")
    public ApiResponse<List<ProactiveHistoryResponse>> listHistory(
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        User user = currentUserResolver.requireCurrentUser();
        return ApiResponse.ok(proactiveHistoryService.listRecent(user, limit, offset));
    }
}
