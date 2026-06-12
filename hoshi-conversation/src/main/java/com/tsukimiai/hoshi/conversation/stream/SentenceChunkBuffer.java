package com.tsukimiai.hoshi.conversation.stream;

import java.util.ArrayList;
import java.util.List;

import org.springframework.util.StringUtils;

public class SentenceChunkBuffer {

    private static final int DEFAULT_MAX_BUFFER_CHARS = 48;
    private static final String SENTENCE_ENDERS = "。！？!?；;";
    private static final String SOFT_BREAKS = "，,、：:~～〜\n";
    private static final String TRAILING_CLOSERS = "\"'”’」』）》）】〕］}";

    private final StringBuilder buffer = new StringBuilder();
    private final int maxBufferChars;

    public SentenceChunkBuffer() {
        this(DEFAULT_MAX_BUFFER_CHARS);
    }

    public SentenceChunkBuffer(int maxBufferChars) {
        this.maxBufferChars = maxBufferChars;
    }

    public List<String> append(String delta) {
        if (!StringUtils.hasText(delta)) {
            return List.of();
        }
        buffer.append(delta);
        return drainCompleted(false);
    }

    public List<String> flushRemaining() {
        return drainCompleted(true);
    }

    private List<String> drainCompleted(boolean flushAll) {
        List<String> segments = new ArrayList<>();
        int cursor = 0;
        while (cursor < buffer.length()) {
            int segmentEnd = findSentenceEnd(cursor);
            if (segmentEnd == -1) {
                if (flushAll) {
                    segmentEnd = buffer.length();
                } else {
                    segmentEnd = findSoftBreak(cursor);
                    if (segmentEnd == -1 && buffer.length() - cursor < maxBufferChars) {
                        break;
                    }
                    if (segmentEnd == -1) {
                        segmentEnd = Math.min(buffer.length(), cursor + maxBufferChars);
                    }
                }
            }
            String segment = buffer.substring(cursor, segmentEnd);
            if (StringUtils.hasText(segment)) {
                segments.add(segment);
            }
            cursor = segmentEnd;
        }
        if (cursor > 0) {
            buffer.delete(0, cursor);
        }
        return segments;
    }

    private int findSentenceEnd(int start) {
        boolean inCodeFence = false;
        for (int i = start; i < buffer.length(); i++) {
            if (startsWithCodeFence(i)) {
                inCodeFence = !inCodeFence;
                i += 2;
                continue;
            }
            if (inCodeFence) {
                continue;
            }
            char current = buffer.charAt(i);
            if (SENTENCE_ENDERS.indexOf(current) >= 0) {
                return extendTrailingClosers(consumeRun(i, current));
            }
            if (current == '…') {
                int runEnd = consumeRun(i, current);
                if (runEnd - i >= 2) {
                    return extendTrailingClosers(runEnd);
                }
            }
            if (current == '.') {
                int runEnd = consumeRun(i, current);
                if (runEnd - i >= 3) {
                    return extendTrailingClosers(runEnd);
                }
            }
        }
        return -1;
    }

    private int findSoftBreak(int start) {
        int softBreak = -1;
        boolean inCodeFence = false;
        for (int i = start; i < buffer.length(); i++) {
            if (startsWithCodeFence(i)) {
                inCodeFence = !inCodeFence;
                i += 2;
                continue;
            }
            if (inCodeFence) {
                continue;
            }
            char current = buffer.charAt(i);
            if (SENTENCE_ENDERS.indexOf(current) >= 0 || current == '…') {
                return extendTrailingClosers(consumeRun(i, current));
            }
            if (SOFT_BREAKS.indexOf(current) >= 0) {
                softBreak = i + 1;
            }
            if (buffer.length() - start >= maxBufferChars && i - start >= maxBufferChars - 1) {
                break;
            }
        }
        if (softBreak != -1) {
            return extendTrailingClosers(softBreak);
        }
        if (buffer.length() - start >= maxBufferChars) {
            return Math.min(buffer.length(), start + maxBufferChars);
        }
        return -1;
    }

    private int consumeRun(int index, char current) {
        int cursor = index;
        while (cursor < buffer.length() && buffer.charAt(cursor) == current) {
            cursor++;
        }
        return cursor;
    }

    private int extendTrailingClosers(int index) {
        int cursor = index;
        while (cursor < buffer.length() && TRAILING_CLOSERS.indexOf(buffer.charAt(cursor)) >= 0) {
            cursor++;
        }
        return cursor;
    }

    private boolean startsWithCodeFence(int index) {
        return index + 2 < buffer.length()
                && buffer.charAt(index) == '`'
                && buffer.charAt(index + 1) == '`'
                && buffer.charAt(index + 2) == '`';
    }
}
