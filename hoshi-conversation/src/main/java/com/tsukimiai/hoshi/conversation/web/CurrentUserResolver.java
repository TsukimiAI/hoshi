package com.tsukimiai.hoshi.conversation.web;

import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.service.CurrentUserService;

@Component
public class CurrentUserResolver {

    private final CurrentUserService currentUserService;

    public CurrentUserResolver(CurrentUserService currentUserService) {
        this.currentUserService = currentUserService;
    }

    public User requireCurrentUser() {
        return currentUserService.requireCurrentUser();
    }
}
