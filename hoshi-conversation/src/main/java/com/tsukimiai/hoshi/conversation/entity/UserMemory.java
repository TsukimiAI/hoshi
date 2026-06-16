package com.tsukimiai.hoshi.conversation.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("user_memory")
public class UserMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String memoryType;

    private String category;

    private String content;

    private String temporalScope;

    private Double confidence;

    private Double importanceScore;

    private Double strengthScore;

    private Integer halfLifeHours;

    private Integer accessCount;

    private Integer alwaysPinned;

    private String status;

    private String vectorPointId;

    private Long sourceSessionId;

    private Long sourceMessageId;

    private Long supersedesMemoryId;

    private LocalDateTime lastReinforcedAt;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getMemoryType() {
        return memoryType;
    }

    public void setMemoryType(String memoryType) {
        this.memoryType = memoryType;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getTemporalScope() {
        return temporalScope;
    }

    public void setTemporalScope(String temporalScope) {
        this.temporalScope = temporalScope;
    }

    public Double getConfidence() {
        return confidence;
    }

    public void setConfidence(Double confidence) {
        this.confidence = confidence;
    }

    public Double getImportanceScore() {
        return importanceScore;
    }

    public void setImportanceScore(Double importanceScore) {
        this.importanceScore = importanceScore;
    }

    public Double getStrengthScore() {
        return strengthScore;
    }

    public void setStrengthScore(Double strengthScore) {
        this.strengthScore = strengthScore;
    }

    public Integer getHalfLifeHours() {
        return halfLifeHours;
    }

    public void setHalfLifeHours(Integer halfLifeHours) {
        this.halfLifeHours = halfLifeHours;
    }

    public Integer getAccessCount() {
        return accessCount;
    }

    public void setAccessCount(Integer accessCount) {
        this.accessCount = accessCount;
    }

    public Integer getAlwaysPinned() {
        return alwaysPinned;
    }

    public void setAlwaysPinned(Integer alwaysPinned) {
        this.alwaysPinned = alwaysPinned;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getVectorPointId() {
        return vectorPointId;
    }

    public void setVectorPointId(String vectorPointId) {
        this.vectorPointId = vectorPointId;
    }

    public Long getSourceSessionId() {
        return sourceSessionId;
    }

    public void setSourceSessionId(Long sourceSessionId) {
        this.sourceSessionId = sourceSessionId;
    }

    public Long getSourceMessageId() {
        return sourceMessageId;
    }

    public void setSourceMessageId(Long sourceMessageId) {
        this.sourceMessageId = sourceMessageId;
    }

    public Long getSupersedesMemoryId() {
        return supersedesMemoryId;
    }

    public void setSupersedesMemoryId(Long supersedesMemoryId) {
        this.supersedesMemoryId = supersedesMemoryId;
    }

    public LocalDateTime getLastReinforcedAt() {
        return lastReinforcedAt;
    }

    public void setLastReinforcedAt(LocalDateTime lastReinforcedAt) {
        this.lastReinforcedAt = lastReinforcedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
