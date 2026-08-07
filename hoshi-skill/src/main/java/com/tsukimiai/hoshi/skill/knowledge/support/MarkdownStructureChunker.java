package com.tsukimiai.hoshi.skill.knowledge.support;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.util.StringUtils;

public class MarkdownStructureChunker {

    private static final Pattern HEADER_PATTERN = Pattern.compile("^(#{1,3})\\s+(.+)$");

    private final TextChunker textChunker;

    public MarkdownStructureChunker(int chunkSizeChars, int overlapChars) {
        this.textChunker = new TextChunker(chunkSizeChars, overlapChars);
    }

    public List<StructuredChunk> chunk(String filename, String text) {
        if (!StringUtils.hasText(text)) {
            return List.of();
        }
        String docTitle = resolveDocTitle(filename);
        if (isMarkdown(filename)) {
            return chunkMarkdown(text, docTitle);
        }
        return chunkPlain(text, docTitle);
    }

    public List<String> collectHeadingPaths(String filename, String text) {
        List<StructuredChunk> chunks = chunk(filename, text);
        return chunks.stream()
                .map(StructuredChunk::headingPath)
                .filter(StringUtils::hasText)
                .distinct()
                .toList();
    }

    private List<StructuredChunk> chunkPlain(String text, String docTitle) {
        List<StructuredChunk> result = new ArrayList<>();
        List<String> parts = textChunker.chunk(text);
        for (int i = 0; i < parts.size(); i++) {
            result.add(StructuredChunk.content(parts.get(i), docTitle, "", 0, i));
        }
        return result;
    }

    private List<StructuredChunk> chunkMarkdown(String text, String docTitle) {
        List<Section> sections = splitMarkdownSections(text);
        List<StructuredChunk> result = new ArrayList<>();
        int globalChunkIndex = 0;
        for (int sectionIndex = 0; sectionIndex < sections.size(); sectionIndex++) {
            Section section = sections.get(sectionIndex);
            if (!StringUtils.hasText(section.body())) {
                continue;
            }
            List<String> parts = textChunker.chunk(section.body());
            for (String part : parts) {
                result.add(StructuredChunk.content(
                        part, docTitle, section.headingPath(), sectionIndex, globalChunkIndex++));
            }
        }
        return result;
    }

    private List<Section> splitMarkdownSections(String text) {
        String[] lines = text.replace('\r', '\n').split("\n", -1);
        List<Section> sections = new ArrayList<>();
        String[] headingStack = new String[3];
        int[] headingLevels = new int[3];
        int stackSize = 0;

        StringBuilder body = new StringBuilder();
        String currentHeadingPath = "";
        int sectionIndex = 0;
        boolean inCodeFence = false;

        for (String rawLine : lines) {
            String line = rawLine == null ? "" : rawLine;
            String trimmed = line.trim();
            if (trimmed.startsWith("```")) {
                inCodeFence = !inCodeFence;
                body.append(line).append('\n');
                continue;
            }
            if (!inCodeFence) {
                Matcher matcher = HEADER_PATTERN.matcher(trimmed);
                if (matcher.matches()) {
                    flushSection(sections, body, currentHeadingPath, sectionIndex);
                    int level = matcher.group(1).length();
                    String title = matcher.group(2).trim();
                    stackSize = updateHeadingStack(headingStack, headingLevels, stackSize, level, title);
                    currentHeadingPath = buildHeadingPath(headingStack, stackSize);
                    sectionIndex = sections.size();
                    continue;
                }
            }
            body.append(line).append('\n');
        }
        flushSection(sections, body, currentHeadingPath, sectionIndex);

        if (sections.isEmpty() && StringUtils.hasText(text)) {
            sections.add(new Section("", text.trim(), 0));
        }
        return sections;
    }

    private void flushSection(
            List<Section> sections, StringBuilder body, String currentHeadingPath, int sectionIndex) {
        if (body.isEmpty()) {
            return;
        }
        sections.add(new Section(currentHeadingPath, body.toString().trim(), sectionIndex));
        body.setLength(0);
    }

    private int updateHeadingStack(String[] headings, int[] levels, int stackSize, int level, String title) {
        while (stackSize > 0 && levels[stackSize - 1] >= level) {
            stackSize--;
        }
        if (stackSize < headings.length) {
            headings[stackSize] = title;
            levels[stackSize] = level;
            stackSize++;
        }
        return stackSize;
    }

    private String buildHeadingPath(String[] headings, int stackSize) {
        if (stackSize <= 0) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < stackSize; i++) {
            if (!StringUtils.hasText(headings[i])) {
                continue;
            }
            if (!builder.isEmpty()) {
                builder.append(" > ");
            }
            builder.append(headings[i].trim());
        }
        return builder.toString();
    }

    public static String resolveDocTitle(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "document";
        }
        String name = filename.trim();
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            return name.substring(0, dot);
        }
        return name;
    }

    private boolean isMarkdown(String filename) {
        if (!StringUtils.hasText(filename)) {
            return false;
        }
        return filename.trim().toLowerCase(Locale.ROOT).endsWith(".md");
    }

    private record Section(String headingPath, String body, int sectionIndex) {
    }
}
