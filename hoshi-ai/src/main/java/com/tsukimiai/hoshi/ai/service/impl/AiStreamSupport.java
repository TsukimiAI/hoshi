package com.tsukimiai.hoshi.ai.service.impl;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.util.StringUtils;

final class AiStreamSupport {

    record CollectedStream(String text, ChatResponse lastResponse) {
    }

    String rootCauseMessage(Throwable ex) {
        Throwable current = ex;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current.getMessage() != null ? current.getMessage() : ex.toString();
    }

    CollectedStream collect(ChatModel model, Prompt prompt, Duration timeout) {
        AtomicReference<String> accumulated = new AtomicReference<>("");
        AtomicReference<ChatResponse> last = new AtomicReference<>();
        model.stream(prompt)
                .timeout(timeout)
                .doOnNext(chunk -> {
                    last.set(chunk);
                    toDelta(chunk, accumulated);
                })
                .blockLast();
        return new CollectedStream(accumulated.get(), last.get());
    }

    String toDelta(ChatResponse chunk, AtomicReference<String> accumulated) {
        String current = extractChunkText(chunk);
        if (!StringUtils.hasText(current)) {
            return null;
        }

        String previous = accumulated.get();
        String delta;
        if (current.startsWith(previous)) {
            delta = current.substring(previous.length());
            accumulated.set(current);
        } else {
            delta = current;
            accumulated.updateAndGet(existing -> existing + current);
        }
        return StringUtils.hasText(delta) ? delta : null;
    }

    private String extractChunkText(ChatResponse chunk) {
        if (chunk.getResult() != null && chunk.getResult().getOutput() != null) {
            String text = chunk.getResult().getOutput().getText();
            if (StringUtils.hasText(text)) {
                return text;
            }
        }
        StringBuilder builder = new StringBuilder();
        for (Generation generation : chunk.getResults()) {
            if (generation.getOutput() == null) {
                continue;
            }
            String text = generation.getOutput().getText();
            if (StringUtils.hasText(text)) {
                builder.append(text);
            }
        }
        return builder.isEmpty() ? null : builder.toString();
    }
}
