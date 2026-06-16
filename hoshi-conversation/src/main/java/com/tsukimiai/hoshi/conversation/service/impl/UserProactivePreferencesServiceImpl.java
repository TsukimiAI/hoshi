package com.tsukimiai.hoshi.conversation.service.impl;

import java.time.LocalDateTime;

import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.tsukimiai.hoshi.conversation.dto.UpdateUserProactivePreferencesRequest;
import com.tsukimiai.hoshi.conversation.dto.UserProactivePreferencesResponse;
import com.tsukimiai.hoshi.conversation.entity.UserProactivePreferences;
import com.tsukimiai.hoshi.conversation.mapper.UserProactivePreferencesMapper;
import com.tsukimiai.hoshi.conversation.service.UserProactivePreferencesService;
import com.tsukimiai.hoshi.user.entity.User;

@Service
@Primary
@Transactional
public class UserProactivePreferencesServiceImpl implements UserProactivePreferencesService {

    private final UserProactivePreferencesMapper preferencesMapper;

    public UserProactivePreferencesServiceImpl(UserProactivePreferencesMapper preferencesMapper) {
        this.preferencesMapper = preferencesMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public UserProactivePreferencesResponse getForUser(User user) {
        return toResponse(loadOrNull(user.getId()));
    }

    @Override
    public UserProactivePreferencesResponse updateForUser(User user, UpdateUserProactivePreferencesRequest request) {
        UserProactivePreferences entity = loadOrNull(user.getId());
        if (entity == null) {
            entity = new UserProactivePreferences();
            entity.setUserId(user.getId());
            entity.setEnabled(true);
            entity.setFollowUpEnabled(true);
        }

        if (request.enabled() != null) {
            entity.setEnabled(request.enabled());
        }
        if (request.followUpEnabled() != null) {
            entity.setFollowUpEnabled(request.followUpEnabled());
        }
        entity.setUpdatedAt(LocalDateTime.now());

        if (preferencesMapper.selectById(user.getId()) == null) {
            preferencesMapper.insert(entity);
        } else {
            preferencesMapper.updateById(entity);
        }
        return toResponse(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public UserProactivePreferencesResponse getEffectiveForUserId(Long userId) {
        return toResponse(loadOrNull(userId));
    }

    private UserProactivePreferences loadOrNull(Long userId) {
        return preferencesMapper.selectById(userId);
    }

    private UserProactivePreferencesResponse toResponse(UserProactivePreferences entity) {
        if (entity == null) {
            return defaultResponse();
        }
        return new UserProactivePreferencesResponse(
                entity.getEnabled() != null ? entity.getEnabled() : true,
                entity.getFollowUpEnabled() != null ? entity.getFollowUpEnabled() : true);
    }

    private UserProactivePreferencesResponse defaultResponse() {
        return new UserProactivePreferencesResponse(true, true);
    }
}
