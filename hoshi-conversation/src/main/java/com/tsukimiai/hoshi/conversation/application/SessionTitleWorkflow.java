package com.tsukimiai.hoshi.conversation.application;

import java.io.IOException;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.ChatSessionTitles;
import com.tsukimiai.hoshi.conversation.dto.ChatSessionResponse;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.support.StreamClientClosedException;
import com.tsukimiai.hoshi.conversation.stream.ChatStreamSink;
import com.tsukimiai.hoshi.user.entity.User;

@Service
public class SessionTitleWorkflow {

    private final ChatSessionService chatSessionService;
    private final ChatMessagePersistenceService persistenceService;
    private final ChatSessionMapper chatSessionMapper;
    private final XingnaiChatService xingnaiChatService;
    private final TransactionTemplate transactionTemplate;

    public SessionTitleWorkflow(
            ChatSessionService chatSessionService,
            ChatMessagePersistenceService persistenceService,
            ChatSessionMapper chatSessionMapper,
            XingnaiChatService xingnaiChatService,
            PlatformTransactionManager transactionManager) {
        this.chatSessionService = chatSessionService;
        this.persistenceService = persistenceService;
        this.chatSessionMapper = chatSessionMapper;
        this.xingnaiChatService = xingnaiChatService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public void maybeAutoTitle(User user, Long sessionId, ChatStreamSink sink) {
        ChatSession session = chatSessionService.get(user, sessionId);
        if (!ChatSessionTitles.NEW_SESSION.equals(session.getTitle())) {
            return;
        }

        List<ChatMessage> messages = persistenceService.listRecentMessages(sessionId, Integer.MAX_VALUE);
        if (messages.size() != 2) {
            return;
        }

        String userMessage = messages.get(0).getContent();
        String assistantReply = messages.get(1).getContent();
        String title = xingnaiChatService.suggestSessionTitle(userMessage, assistantReply);
        if (!StringUtils.hasText(title)) {
            return;
        }

        transactionTemplate.executeWithoutResult(status -> {
            ChatSession current = chatSessionService.get(user, sessionId);
            if (!ChatSessionTitles.NEW_SESSION.equals(current.getTitle())) {
                return;
            }
            current.setTitle(title.trim());
            chatSessionMapper.updateById(current);
        });

        try {
            sink.emit("session", ChatSessionResponse.from(chatSessionService.get(user, sessionId)));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }
}
