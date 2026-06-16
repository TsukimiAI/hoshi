package com.tsukimiai.hoshi.conversation.web;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.tsukimiai.hoshi.common.api.ApiResponse;
import com.tsukimiai.hoshi.conversation.dto.CreateUserMemoryRequest;
import com.tsukimiai.hoshi.conversation.dto.MemoryCorrectionResponse;
import com.tsukimiai.hoshi.conversation.dto.RecentMemoryResponse;
import com.tsukimiai.hoshi.conversation.dto.UpdateUserMemoryRequest;
import com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse;
import com.tsukimiai.hoshi.conversation.service.UserMemoryService;
import com.tsukimiai.hoshi.user.entity.User;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/memories")
public class UserMemoryController {

    private final UserMemoryService userMemoryService;
    private final CurrentUserResolver currentUserResolver;

    public UserMemoryController(
            UserMemoryService userMemoryService,
            CurrentUserResolver currentUserResolver) {
        this.userMemoryService = userMemoryService;
        this.currentUserResolver = currentUserResolver;
    }

    @GetMapping
    public ApiResponse<List<UserMemoryResponse>> listMemories(
            @RequestParam(required = false) String category) {
        User user = currentUserResolver.requireCurrentUser();
        return ApiResponse.ok(userMemoryService.listMemories(user, category));
    }

    @GetMapping("/recent")
    public ApiResponse<List<RecentMemoryResponse>> listRecentMemories(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime since) {
        User user = currentUserResolver.requireCurrentUser();
        return ApiResponse.ok(userMemoryService.listRecentLongTermEvents(user, since));
    }

    @GetMapping("/corrections")
    public ApiResponse<List<MemoryCorrectionResponse>> listCorrections(
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        User user = currentUserResolver.requireCurrentUser();
        return ApiResponse.ok(userMemoryService.listRecentCorrections(user, limit, offset));
    }

    @PostMapping
    public ApiResponse<UserMemoryResponse> createMemory(
            @Valid @RequestBody CreateUserMemoryRequest request) {
        User user = currentUserResolver.requireCurrentUser();
        return ApiResponse.ok(userMemoryService.createLongTermMemory(user, request));
    }

    @PatchMapping("/{memoryId}")
    public ApiResponse<UserMemoryResponse> updateMemory(
            @PathVariable Long memoryId,
            @Valid @RequestBody UpdateUserMemoryRequest request) {
        User user = currentUserResolver.requireCurrentUser();
        return ApiResponse.ok(userMemoryService.updateLongTermMemory(user, memoryId, request));
    }

    @DeleteMapping("/{memoryId}")
    public ApiResponse<Void> deleteMemory(@PathVariable Long memoryId) {
        User user = currentUserResolver.requireCurrentUser();
        userMemoryService.archiveMemory(user, memoryId);
        return ApiResponse.ok();
    }
}
