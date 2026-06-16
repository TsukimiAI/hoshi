package com.tsukimiai.hoshi.user.web;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.tsukimiai.hoshi.common.api.ApiResponse;
import com.tsukimiai.hoshi.common.storage.StoredObject;
import com.tsukimiai.hoshi.user.dto.AuthResponse;
import com.tsukimiai.hoshi.user.dto.UpdateProfileRequest;
import com.tsukimiai.hoshi.user.service.UserProfileService;

import jakarta.validation.Valid;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserProfileService userProfileService;

    public UserController(UserProfileService userProfileService) {
        this.userProfileService = userProfileService;
    }

    @PatchMapping("/me")
    public ApiResponse<AuthResponse.UserProfile> updateProfile(@Valid @RequestBody UpdateProfileRequest request) {
        return ApiResponse.ok(userProfileService.updateProfile(request));
    }

    @PostMapping("/me/avatar")
    public ApiResponse<AuthResponse.UserProfile> uploadAvatar(@RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(userProfileService.uploadAvatar(file));
    }

    @DeleteMapping("/me/avatar")
    public ApiResponse<AuthResponse.UserProfile> deleteAvatar() {
        return ApiResponse.ok(userProfileService.deleteAvatar());
    }

    @GetMapping("/me/avatar/content")
    public ResponseEntity<InputStreamResource> getAvatarContent() {
        return avatarResponse(userProfileService.getAvatarContent());
    }

    @GetMapping("/{userId:\\d+}/avatar/content")
    public ResponseEntity<InputStreamResource> getUserAvatarContent(@PathVariable Long userId) {
        return avatarResponse(userProfileService.getAvatarContentForUser(userId));
    }

    private ResponseEntity<InputStreamResource> avatarResponse(StoredObject object) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(object.contentType()))
                .cacheControl(CacheControl.noCache())
                .body(new InputStreamResource(object.inputStream()));
    }

}
