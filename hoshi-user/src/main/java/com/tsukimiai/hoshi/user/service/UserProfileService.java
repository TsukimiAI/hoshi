package com.tsukimiai.hoshi.user.service;

import org.springframework.web.multipart.MultipartFile;

import com.tsukimiai.hoshi.common.storage.StoredObject;
import com.tsukimiai.hoshi.user.dto.AuthResponse;
import com.tsukimiai.hoshi.user.dto.UpdateProfileRequest;

public interface UserProfileService {

    AuthResponse.UserProfile updateProfile(UpdateProfileRequest request);

    AuthResponse.UserProfile uploadAvatar(MultipartFile file);

    AuthResponse.UserProfile deleteAvatar();

    StoredObject getAvatarContent();

    StoredObject getAvatarContentForUser(Long userId);

}
