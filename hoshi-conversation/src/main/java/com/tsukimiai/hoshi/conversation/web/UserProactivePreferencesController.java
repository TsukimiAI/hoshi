package com.tsukimiai.hoshi.conversation.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.tsukimiai.hoshi.common.api.ApiResponse;
import com.tsukimiai.hoshi.conversation.dto.UpdateUserProactivePreferencesRequest;
import com.tsukimiai.hoshi.conversation.dto.UserProactivePreferencesResponse;
import com.tsukimiai.hoshi.conversation.service.UserProactivePreferencesService;
import com.tsukimiai.hoshi.user.entity.User;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/users/me/proactive-preferences")
public class UserProactivePreferencesController {

    private final UserProactivePreferencesService preferencesService;
    private final CurrentUserResolver currentUserResolver;

    public UserProactivePreferencesController(
            UserProactivePreferencesService preferencesService,
            CurrentUserResolver currentUserResolver) {
        this.preferencesService = preferencesService;
        this.currentUserResolver = currentUserResolver;
    }

    @GetMapping
    public ApiResponse<UserProactivePreferencesResponse> getPreferences() {
        User user = currentUserResolver.requireCurrentUser();
        return ApiResponse.ok(preferencesService.getForUser(user));
    }

    @PatchMapping
    public ApiResponse<UserProactivePreferencesResponse> updatePreferences(
            @Valid @RequestBody UpdateUserProactivePreferencesRequest request) {
        User user = currentUserResolver.requireCurrentUser();
        return ApiResponse.ok(preferencesService.updateForUser(user, request));
    }
}
