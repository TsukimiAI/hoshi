package com.tsukimiai.hoshi.conversation.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("chat_session")
public class ChatSession {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String title;

    private String summary;

    private String summaryFacts;

    private String summaryDecisions;

    private String summaryOpenLoops;

    private Integer summaryVersion;

    private Long compressedUntilMessageId;

    private LocalDateTime summaryUpdatedAt;

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

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public String getSummaryFacts() {
        return summaryFacts;
    }

    public void setSummaryFacts(String summaryFacts) {
        this.summaryFacts = summaryFacts;
    }

    public String getSummaryDecisions() {
        return summaryDecisions;
    }

    public void setSummaryDecisions(String summaryDecisions) {
        this.summaryDecisions = summaryDecisions;
    }

    public String getSummaryOpenLoops() {
        return summaryOpenLoops;
    }

    public void setSummaryOpenLoops(String summaryOpenLoops) {
        this.summaryOpenLoops = summaryOpenLoops;
    }

    public Integer getSummaryVersion() {
        return summaryVersion;
    }

    public void setSummaryVersion(Integer summaryVersion) {
        this.summaryVersion = summaryVersion;
    }

    public Long getCompressedUntilMessageId() {
        return compressedUntilMessageId;
    }

    public void setCompressedUntilMessageId(Long compressedUntilMessageId) {
        this.compressedUntilMessageId = compressedUntilMessageId;
    }

    public LocalDateTime getSummaryUpdatedAt() {
        return summaryUpdatedAt;
    }

    public void setSummaryUpdatedAt(LocalDateTime summaryUpdatedAt) {
        this.summaryUpdatedAt = summaryUpdatedAt;
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
