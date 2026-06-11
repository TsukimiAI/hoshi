package com.tsukimiai.hoshi.conversation.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.tsukimiai.hoshi.common.api.ApiResponse;
import com.tsukimiai.hoshi.conversation.dto.ChatMessageResponse;
import com.tsukimiai.hoshi.conversation.dto.SendChatMessageRequest;
import com.tsukimiai.hoshi.conversation.service.ChatMessageService;
import com.tsukimiai.hoshi.conversation.stream.HttpSseStreamSink;
import com.tsukimiai.hoshi.user.entity.User;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/chat/sessions/{sessionId}/messages")
public class ChatMessageController {

    private final ChatMessageService chatMessageService;
    private final CurrentUserResolver currentUserResolver;

    public ChatMessageController(
            ChatMessageService chatMessageService,
            CurrentUserResolver currentUserResolver) {
        this.chatMessageService = chatMessageService;
        this.currentUserResolver = currentUserResolver;
    }

    @GetMapping
    public ApiResponse<List<ChatMessageResponse>> listMessages(@PathVariable Long sessionId) {
        User user = currentUserResolver.requireCurrentUser();
        List<ChatMessageResponse> messages = chatMessageService.listBySession(user, sessionId)
                .stream()
                .map(ChatMessageResponse::from)
                .toList();
        return ApiResponse.ok(messages);
    }

    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public void sendMessage(
            @PathVariable Long sessionId,
            @Valid @RequestBody SendChatMessageRequest request,
            HttpServletResponse response) throws IOException {
        User user = currentUserResolver.requireCurrentUser();
        writeSseResponse(response, sink -> chatMessageService.sendStream(user, sessionId, request.content(), sink));
    }

    @PostMapping(path = "/retry", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public void retryMessage(
            @PathVariable Long sessionId,
            HttpServletResponse response) throws IOException {
        User user = currentUserResolver.requireCurrentUser();
        writeSseResponse(response, sink -> chatMessageService.retryStream(user, sessionId, sink));
    }

    private void writeSseResponse(HttpServletResponse response, SseStreamConsumer consumer) throws IOException {
        response.setStatus(HttpServletResponse.SC_OK);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.TEXT_EVENT_STREAM_VALUE);
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Connection", "keep-alive");
        response.setHeader("X-Accel-Buffering", "no");
        response.setBufferSize(0);

        HttpSseStreamSink sink = new HttpSseStreamSink(response.getOutputStream());
        consumer.accept(sink);
        response.flushBuffer();
    }

    @FunctionalInterface
    private interface SseStreamConsumer {
        void accept(HttpSseStreamSink sink) throws IOException;
    }
}
