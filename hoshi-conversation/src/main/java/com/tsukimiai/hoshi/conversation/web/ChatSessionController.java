package com.tsukimiai.hoshi.conversation.web;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.tsukimiai.hoshi.common.api.ApiResponse;
import com.tsukimiai.hoshi.conversation.dto.ChatSessionResponse;
import com.tsukimiai.hoshi.conversation.dto.CreateChatSessionRequest;
import com.tsukimiai.hoshi.conversation.dto.UpdateChatSessionRequest;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.user.entity.User;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/chat/sessions")
public class ChatSessionController {

    private final ChatSessionService chatSessionService;
    private final CurrentUserResolver currentUserResolver;

    public ChatSessionController(
            ChatSessionService chatSessionService,
            CurrentUserResolver currentUserResolver) {
        this.chatSessionService = chatSessionService;
        this.currentUserResolver = currentUserResolver;
    }

    @GetMapping
    public ApiResponse<List<ChatSessionResponse>> listSessions() {
        User user = currentUserResolver.requireCurrentUser();
        List<ChatSessionResponse> sessions = chatSessionService.listByUser(user)
                .stream()
                .map(ChatSessionResponse::from)
                .toList();
        return ApiResponse.ok(sessions);
    }

    @PostMapping
    public ApiResponse<ChatSessionResponse> createSession(
            @Valid @RequestBody(required = false) CreateChatSessionRequest request) {
        User user = currentUserResolver.requireCurrentUser();
        String title = request != null ? request.title() : null;
        return ApiResponse.ok(ChatSessionResponse.from(chatSessionService.create(user, title)));
    }

    @GetMapping("/{sessionId}")
    public ApiResponse<ChatSessionResponse> getSession(@PathVariable Long sessionId) {
        User user = currentUserResolver.requireCurrentUser();
        return ApiResponse.ok(ChatSessionResponse.from(chatSessionService.get(user, sessionId)));
    }

    @PatchMapping("/{sessionId}")
    public ApiResponse<ChatSessionResponse> updateSession(
            @PathVariable Long sessionId,
            @Valid @RequestBody UpdateChatSessionRequest request) {
        User user = currentUserResolver.requireCurrentUser();
        return ApiResponse.ok(ChatSessionResponse.from(chatSessionService.updateTitle(user, sessionId, request.title())));
    }

    @DeleteMapping("/{sessionId}")
    public ApiResponse<Void> deleteSession(@PathVariable Long sessionId) {
        User user = currentUserResolver.requireCurrentUser();
        chatSessionService.delete(user, sessionId);
        return ApiResponse.ok();
    }
}
