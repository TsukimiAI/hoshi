package com.tsukimiai.hoshi.conversation.application;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tsukimiai.hoshi.ai.model.AiSessionSummary;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;

@Component
public class SessionSummaryCodec {

    private static final Logger log = LoggerFactory.getLogger(SessionSummaryCodec.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    public AiSessionSummary hydrateSessionSummary(ChatSession session) {
        if (session == null) {
            return null;
        }
        AiSessionSummary summary = new AiSessionSummary(
                session.getSummaryVersion(),
                session.getCompressedUntilMessageId(),
                session.getSummary(),
                readStringList(session.getSummaryFacts()),
                readStringList(session.getSummaryDecisions()),
                readStringList(session.getSummaryOpenLoops()));
        return summary.hasContent() ? summary : null;
    }

    public String writeStringList(List<String> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(values);
        } catch (Exception ex) {
            log.warn("Failed to serialize session summary list json", ex);
            return null;
        }
    }

    private List<String> readStringList(String rawJson) {
        if (!StringUtils.hasText(rawJson)) {
            return List.of();
        }
        try {
            return objectMapper.readerForListOf(String.class).readValue(rawJson);
        } catch (Exception ex) {
            log.warn("Failed to read session summary list json", ex);
            return List.of();
        }
    }
}
