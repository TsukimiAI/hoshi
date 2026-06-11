package com.tsukimiai.hoshi.conversation.service;

import java.util.List;

import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.stream.ChatStreamSink;
import com.tsukimiai.hoshi.user.entity.User;

public interface ChatMessageService {

    List<ChatMessage> listBySession(User user, Long sessionId);

    void sendStream(User user, Long sessionId, String content, ChatStreamSink sink);

    void retryStream(User user, Long sessionId, ChatStreamSink sink);
}
