package com.tsukimiai.hoshi.conversation.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("proactive_follow_up_log")
public class ProactiveFollowUpLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long proactiveLogId;

    private Long sessionId;

    private Long messageId;

    private String mode;

    private String judgmentReason;

    private LocalDateTime createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getProactiveLogId() {
        return proactiveLogId;
    }

    public void setProactiveLogId(Long proactiveLogId) {
        this.proactiveLogId = proactiveLogId;
    }

    public Long getSessionId() {
        return sessionId;
    }

    public void setSessionId(Long sessionId) {
        this.sessionId = sessionId;
    }

    public Long getMessageId() {
        return messageId;
    }

    public void setMessageId(Long messageId) {
        this.messageId = messageId;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public String getJudgmentReason() {
        return judgmentReason;
    }

    public void setJudgmentReason(String judgmentReason) {
        this.judgmentReason = judgmentReason;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
