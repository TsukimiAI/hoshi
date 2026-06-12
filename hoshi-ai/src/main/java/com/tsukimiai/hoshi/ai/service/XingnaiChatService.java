package com.tsukimiai.hoshi.ai.service;

import java.util.List;

import com.tsukimiai.hoshi.ai.model.AiChatTurn;

import reactor.core.publisher.Flux;

public interface XingnaiChatService {

    String complete(List<AiChatTurn> history);

    Flux<String> stream(List<AiChatTurn> history);

    Flux<String> stream(List<AiChatTurn> history, boolean webSearch);

    String suggestSessionTitle(String userMessage, String assistantReply);

    String suggestEmotion(String assistantReply, List<String> allowedEmotions);
}
