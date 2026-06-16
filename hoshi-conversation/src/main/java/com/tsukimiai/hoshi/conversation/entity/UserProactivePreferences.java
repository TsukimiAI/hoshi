package com.tsukimiai.hoshi.conversation.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("user_proactive_preferences")
public class UserProactivePreferences {

    @TableId
    private Long userId;

    private Boolean enabled;

    private Boolean followUpEnabled;

    private LocalDateTime updatedAt;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public Boolean getFollowUpEnabled() {
        return followUpEnabled;
    }

    public void setFollowUpEnabled(Boolean followUpEnabled) {
        this.followUpEnabled = followUpEnabled;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
