package com.tsukimiai.hoshi.skill.knowledge.support;

import java.util.ArrayList;
import java.util.List;

import org.springframework.util.StringUtils;

public class TextChunker {

    private final int chunkSizeChars;
    private final int overlapChars;

    public TextChunker(int chunkSizeChars, int overlapChars) {
        this.chunkSizeChars = Math.max(200, chunkSizeChars);
        this.overlapChars = Math.max(0, Math.min(overlapChars, this.chunkSizeChars / 2));
    }

    public List<String> chunk(String text) {
        if (!StringUtils.hasText(text)) {
            return List.of();
        }
        String normalized = normalize(text);
        if (normalized.isBlank()) {
            return List.of();
        }
        List<String> chunks = new ArrayList<>();
        int start = 0;
        int length = normalized.length();
        while (start < length) {
            int end = Math.min(length, start + chunkSizeChars);
            String part = normalized.substring(start, end).trim();
            if (!part.isBlank()) {
                chunks.add(part);
            }
            if (end >= length) {
                break;
            }
            start = Math.max(0, end - overlapChars);
        }
        return chunks;
    }

    private String normalize(String text) {
        String s = text.replace('\u0000', ' ').replace('\r', '\n');
        // collapse excessive whitespace while keeping newlines
        s = s.replaceAll("[ \\t\\f\\v]+", " ");
        s = s.replaceAll("\\n{3,}", "\n\n");
        return s.trim();
    }
}

