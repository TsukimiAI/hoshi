package com.tsukimiai.hoshi.skill.api.knowledge;

import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class KnowledgeQueryIntentRules {

    private static final Pattern SUMMARY_PATTERN = Pattern.compile("总结|梳理|全文|整个|整份|概括|归纳");
    private static final Pattern DOCUMENT_REF_PATTERN = Pattern.compile("文档|笔记|资料");
    private static final Pattern FOLLOW_UP_PATTERN = Pattern.compile("其中|这部分|那个|刚才|上面|继续|还有|那么|对于");
    private static final Pattern TOPIC_FOCUS_PATTERN =
            Pattern.compile("(?:其中)?对于([^，。,？?！!\\s]{1,24}?)(?:的)?(?:笔记|文档|资料|部分)?");

    private KnowledgeQueryIntentRules() {
    }

    public static boolean isSummaryLikeQuery(String query) {
        return hasText(query) && SUMMARY_PATTERN.matcher(query).find();
    }

    public static boolean referencesDocument(String query) {
        return hasText(query) && DOCUMENT_REF_PATTERN.matcher(query).find();
    }

    public static boolean isFollowUpLikeQuery(String query) {
        return hasText(query) && FOLLOW_UP_PATTERN.matcher(query).find();
    }

    public static String extractTopicFocus(String query) {
        if (!hasText(query)) {
            return "";
        }
        Matcher matcher = TOPIC_FOCUS_PATTERN.matcher(query.trim());
        if (!matcher.find()) {
            return "";
        }
        String topic = matcher.group(1).trim();
        if (topic.endsWith("的")) {
            topic = topic.substring(0, topic.length() - 1).trim();
        }
        if (topic.length() < 2 || referencesDocument(topic)) {
            return "";
        }
        return topic;
    }

    public static boolean hasDocumentSignalInContext(List<String> contextQueries) {
        if (contextQueries == null || contextQueries.isEmpty()) {
            return false;
        }
        for (String contextQuery : contextQueries) {
            if (!hasText(contextQuery)) {
                continue;
            }
            if (referencesDocument(contextQuery) || isSummaryLikeQuery(contextQuery)) {
                return true;
            }
        }
        return false;
    }

    public static String normalizeFilenameToken(String filename) {
        if (!hasText(filename)) {
            return "";
        }
        String name = filename.trim();
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            name = name.substring(0, dot);
        }
        return name.toLowerCase(Locale.ROOT).replaceAll("[\\s_\\-]+", "");
    }

    public static String normalizeQueryToken(String text) {
        if (!hasText(text)) {
            return "";
        }
        return text.trim().toLowerCase(Locale.ROOT).replaceAll("[\\s_\\-]+", "");
    }

    public static boolean filenameMatchesQuery(String filename, String query) {
        String fileToken = normalizeFilenameToken(filename);
        String queryToken = normalizeQueryToken(query);
        if (!hasText(fileToken) || !hasText(queryToken) || fileToken.length() < 3) {
            return false;
        }
        return queryToken.contains(fileToken) || fileToken.contains(queryToken);
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
