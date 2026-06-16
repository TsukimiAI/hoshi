package com.tsukimiai.hoshi.user.service.impl;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.common.storage.StoredObject;
import com.tsukimiai.hoshi.infrastructure.storage.ObjectStorageService;
import com.tsukimiai.hoshi.user.dto.AuthResponse;
import com.tsukimiai.hoshi.user.dto.UpdateProfileRequest;
import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.mapper.UserMapper;
import com.tsukimiai.hoshi.user.service.CurrentUserService;
import com.tsukimiai.hoshi.user.service.UserProfileService;

@Service
public class UserProfileServiceImpl implements UserProfileService {

    private static final long MAX_AVATAR_BYTES = 6L * 1024 * 1024;
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/webp");
    private static final String AVATAR_PREFIX = "avatars/";

    private final UserMapper userMapper;
    private final CurrentUserService currentUserService;
    private final ObjectStorageService objectStorageService;

    public UserProfileServiceImpl(
            UserMapper userMapper,
            CurrentUserService currentUserService,
            ObjectStorageService objectStorageService) {
        this.userMapper = userMapper;
        this.currentUserService = currentUserService;
        this.objectStorageService = objectStorageService;
    }

    @Override
    @Transactional
    public AuthResponse.UserProfile updateProfile(UpdateProfileRequest request) {
        User user = requireCurrentUser();
        String username = request.username().trim();
        if (username.equals(user.getUsername())) {
            return toUserProfile(user);
        }

        boolean exists = userMapper.exists(Wrappers.<User>lambdaQuery()
                .eq(User::getUsername, username)
                .ne(User::getId, user.getId()));
        if (exists) {
            throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS);
        }

        LocalDateTime now = LocalDateTime.now();
        user.setUsername(username);
        user.setUpdatedAt(now);
        userMapper.updateById(user);
        return toUserProfile(user);
    }

    @Override
    @Transactional
    public AuthResponse.UserProfile uploadAvatar(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请选择头像文件");
        }
        if (file.getSize() > MAX_AVATAR_BYTES) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "头像大小不能超过 6MB");
        }

        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase(Locale.ROOT))) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "仅支持 JPG、PNG、WebP 格式头像");
        }

        User user = requireCurrentUser();
        String key = AVATAR_PREFIX
                + user.getId()
                + "/"
                + UUID.randomUUID()
                + extensionForContentType(contentType);

        try {
            objectStorageService.putObject(key, file.getInputStream(), file.getSize(), contentType);
        } catch (IOException exception) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "头像上传失败");
        }

        String previousAvatarUrl = user.getAvatarUrl();
        String avatarUrl = objectStorageService.buildPublicUrl(key);
        LocalDateTime now = LocalDateTime.now();
        user.setAvatarUrl(avatarUrl);
        user.setUpdatedAt(now);
        userMapper.updateById(user);

        deletePreviousAvatar(previousAvatarUrl);
        return toUserProfile(user);
    }

    @Override
    @Transactional
    public AuthResponse.UserProfile deleteAvatar() {
        User user = requireCurrentUser();
        deletePreviousAvatar(user.getAvatarUrl());
        LocalDateTime now = LocalDateTime.now();
        userMapper.update(
                null,
                Wrappers.<User>lambdaUpdate()
                        .set(User::getAvatarUrl, null)
                        .set(User::getUpdatedAt, now)
                        .eq(User::getId, user.getId()));
        user.setAvatarUrl(null);
        user.setUpdatedAt(now);
        return toUserProfile(user);
    }

    @Override
    public StoredObject getAvatarContent() {
        User user = requireCurrentUser();
        return loadAvatarContent(user);
    }

    @Override
    public StoredObject getAvatarContentForUser(Long userId) {
        requireCurrentUser();
        if (userId == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "用户 ID 无效");
        }
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
        return loadAvatarContent(user);
    }

    private StoredObject loadAvatarContent(User user) {
        String avatarUrl = user.getAvatarUrl();
        if (avatarUrl == null || avatarUrl.isBlank()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "头像不存在");
        }
        String key = resolveAvatarKey(avatarUrl);
        if (key == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "头像不存在");
        }
        return objectStorageService.getObject(key)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "头像不存在"));
    }

    private void deletePreviousAvatar(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) {
            return;
        }
        String key = resolveAvatarKey(avatarUrl);
        if (key == null) {
            return;
        }
        objectStorageService.deleteObject(key);
    }

    private String resolveAvatarKey(String avatarUrl) {
        String key = objectStorageService.resolveStorageKey(avatarUrl);
        if (key == null || !key.startsWith(AVATAR_PREFIX)) {
            return null;
        }
        return key;
    }

    private String extensionForContentType(String contentType) {
        return switch (contentType.toLowerCase(Locale.ROOT)) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            default -> throw new BusinessException(ErrorCode.BAD_REQUEST, "不支持的图片格式");
        };
    }

    private User requireCurrentUser() {
        return currentUserService.requireCurrentUser();
    }

    private AuthResponse.UserProfile toUserProfile(User user) {
        return new AuthResponse.UserProfile(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getAvatarUrl(),
                user.hasVerifiedEmail(),
                formatDateTime(user.getCreatedAt()),
                formatDateTime(user.getLastLoginAt()));
    }

    private String formatDateTime(LocalDateTime value) {
        if (value == null) {
            return null;
        }
        return value.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }

}
