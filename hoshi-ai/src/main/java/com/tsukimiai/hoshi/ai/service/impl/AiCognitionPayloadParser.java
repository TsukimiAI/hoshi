package com.tsukimiai.hoshi.ai.service.impl;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionPayload;

final class AiCognitionPayloadParser {

    private static final Logger log = LoggerFactory.getLogger(AiCognitionPayloadParser.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    <T extends AiCognitionPayload> T parsePayload(String raw, Class<T> type) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return objectMapper.readValue(extractJson(raw), type);
        } catch (Exception ex) {
            log.warn("Failed to parse cognition payload {}: {}", type.getSimpleName(), ex.getMessage());
            return null;
        }
    }

    private String extractJson(String raw) {
        String text = raw.trim();
        if (text.startsWith("```")) {
            int firstBreak = text.indexOf('\n');
            int lastFence = text.lastIndexOf("```");
            if (firstBreak > 0 && lastFence > firstBreak) {
                text = text.substring(firstBreak + 1, lastFence).trim();
            }
        }
        int jsonStart = Math.min(indexOrMax(text, '{'), indexOrMax(text, '['));
        int jsonEnd = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
        if (jsonStart >= 0 && jsonEnd >= jsonStart) {
            return text.substring(jsonStart, jsonEnd + 1);
        }
        return text;
    }

    private int indexOrMax(String text, char target) {
        int index = text.indexOf(target);
        return index >= 0 ? index : Integer.MAX_VALUE;
    }
}
