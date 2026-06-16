package com.tsukimiai.hoshi.conversation.application;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageRole;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageSource;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageSegment;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageSegmentMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.support.AssistantSegment;

@Service
public class ChatMessagePersistenceService {

    private final ChatMessageMapper chatMessageMapper;
    private final ChatMessageSegmentMapper chatMessageSegmentMapper;
    private final ChatSessionMapper chatSessionMapper;

    public ChatMessagePersistenceService(
            ChatMessageMapper chatMessageMapper,
            ChatMessageSegmentMapper chatMessageSegmentMapper,
            ChatSessionMapper chatSessionMapper) {
        this.chatMessageMapper = chatMessageMapper;
        this.chatMessageSegmentMapper = chatMessageSegmentMapper;
        this.chatSessionMapper = chatSessionMapper;
    }

    public List<ChatMessage> listRecentMessages(Long sessionId, int limit) {
        LambdaQueryWrapper<ChatMessage> query = new LambdaQueryWrapper<ChatMessage>()
                .eq(ChatMessage::getSessionId, sessionId)
                .orderByDesc(ChatMessage::getCreatedAt)
                .orderByDesc(ChatMessage::getId);
        if (limit != Integer.MAX_VALUE) {
            query.last("LIMIT " + limit);
        }
        List<ChatMessage> messages = new ArrayList<>(chatMessageMapper.selectList(query));
        Collections.reverse(messages);
        return messages;
    }

    public void hydrateSegments(List<ChatMessage> messages) {
        if (messages.isEmpty()) {
            return;
        }
        List<Long> messageIds = messages.stream()
                .map(ChatMessage::getId)
                .toList();
        List<ChatMessageSegment> segments = chatMessageSegmentMapper.selectList(
                new LambdaQueryWrapper<ChatMessageSegment>()
                        .in(ChatMessageSegment::getMessageId, messageIds)
                        .orderByAsc(ChatMessageSegment::getMessageId)
                        .orderByAsc(ChatMessageSegment::getSeq)
                        .orderByAsc(ChatMessageSegment::getId));
        Map<Long, List<ChatMessageSegment>> segmentMap = new HashMap<>();
        for (ChatMessageSegment segment : segments) {
            segmentMap.computeIfAbsent(segment.getMessageId(), ignored -> new ArrayList<>()).add(segment);
        }
        for (ChatMessage message : messages) {
            message.setSegments(segmentMap.getOrDefault(message.getId(), List.of()));
        }
    }

    public ChatMessage insertMessage(Long sessionId, ChatMessageRole role, String content, String emotion) {
        return insertMessage(sessionId, role, content, emotion, false);
    }

    public ChatMessage insertMessage(
            Long sessionId,
            ChatMessageRole role,
            String content,
            String emotion,
            boolean webSearchEnabled) {
        return insertMessage(sessionId, role, content, emotion, webSearchEnabled, ChatMessageSource.CHAT);
    }

    public ChatMessage insertProactiveAssistantMessage(
            Long sessionId,
            String content,
            String emotion,
            ChatMessageSource messageSource) {
        return insertMessage(sessionId, ChatMessageRole.ASSISTANT, content, emotion, false, messageSource);
    }

    private ChatMessage insertMessage(
            Long sessionId,
            ChatMessageRole role,
            String content,
            String emotion,
            boolean webSearchEnabled,
            ChatMessageSource messageSource) {
        LocalDateTime now = LocalDateTime.now();
        ChatMessage message = new ChatMessage();
        message.setSessionId(sessionId);
        message.setRole(role.getValue());
        message.setContent(content);
        message.setEmotion(emotion);
        message.setWebSearchEnabled(role == ChatMessageRole.USER && webSearchEnabled);
        message.setMessageSource(messageSource.getValue());
        message.setCreatedAt(now);
        chatMessageMapper.insert(message);
        return message;
    }

    public List<ChatMessageSegment> insertSegments(Long messageId, List<AssistantSegment> segments) {
        List<ChatMessageSegment> savedSegments = new ArrayList<>(segments.size());
        LocalDateTime now = LocalDateTime.now();
        for (AssistantSegment segment : segments) {
            ChatMessageSegment saved = new ChatMessageSegment();
            saved.setMessageId(messageId);
            saved.setSeq(segment.seq());
            saved.setContent(segment.content());
            saved.setEmotion(segment.emotion().getValue());
            saved.setCreatedAt(now);
            chatMessageSegmentMapper.insert(saved);
            savedSegments.add(saved);
        }
        return savedSegments;
    }

    public void deleteMessageById(Long messageId) {
        chatMessageMapper.deleteById(messageId);
    }

    public ChatMessage findMessage(Long messageId) {
        return chatMessageMapper.selectById(messageId);
    }

    public void touchSession(ChatSession session) {
        session.setUpdatedAt(LocalDateTime.now());
        chatSessionMapper.updateById(session);
    }

    public void clearSessionSummary(ChatSession session) {
        session.setSummary(null);
        session.setSummaryFacts(null);
        session.setSummaryDecisions(null);
        session.setSummaryOpenLoops(null);
        session.setSummaryVersion(null);
        session.setCompressedUntilMessageId(null);
        session.setSummaryUpdatedAt(null);
        chatSessionMapper.updateById(session);
    }
}
