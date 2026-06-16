package com.tsukimiai.hoshi.conversation.service;

import com.tsukimiai.hoshi.conversation.dto.UpdateUserProactivePreferencesRequest;
import com.tsukimiai.hoshi.conversation.dto.UserProactivePreferencesResponse;
import com.tsukimiai.hoshi.user.entity.User;

public interface UserProactivePreferencesService {

    UserProactivePreferencesResponse getForUser(User user);

    UserProactivePreferencesResponse updateForUser(User user, UpdateUserProactivePreferencesRequest request);

    UserProactivePreferencesResponse getEffectiveForUserId(Long userId);
}
