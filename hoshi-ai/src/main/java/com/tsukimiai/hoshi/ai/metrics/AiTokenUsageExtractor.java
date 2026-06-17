package com.tsukimiai.hoshi.ai.metrics;

import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;

/**
 * Extract token usage from Spring AI responses when provider reports it.
 */
public final class AiTokenUsageExtractor {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private AiTokenUsageExtractor() {
    }

    public static Optional<AiTokenUsage> extract(ChatResponse response) {
        if (response == null || response.getMetadata() == null) {
            return Optional.empty();
        }
        Usage usage = response.getMetadata().getUsage();
        if (usage == null) {
            return Optional.empty();
        }
        Optional<AiTokenUsage> standard = extractFromStandardFields(usage);
        if (standard.isPresent()) {
            return standard;
        }

        Optional<AiTokenUsage> nativeUsage = extractFromNativeUsage(usage.getNativeUsage());
        if (nativeUsage.isPresent()) {
            return nativeUsage;
        }

        return Optional.empty();
    }

    public record AiTokenUsage(int promptTokens, int completionTokens, int totalTokens, String source) {
    }

    private static Optional<AiTokenUsage> extractFromStandardFields(Usage usage) {
        Integer prompt = usage.getPromptTokens();
        Integer completion = usage.getCompletionTokens();
        Integer total = usage.getTotalTokens();
        if (prompt == null && completion == null && total == null) {
            return Optional.empty();
        }
        int promptTokens = prompt == null ? 0 : Math.max(prompt, 0);
        int completionTokens = completion == null ? 0 : Math.max(completion, 0);
        int totalTokens = total == null ? promptTokens + completionTokens : Math.max(total, 0);

        // Spring AI may provide a default Usage instance with zeros when provider did not report usage.
        // Treat an all-zero usage as "unavailable" to avoid falsely labeling estimated data as actual.
        if (promptTokens == 0 && completionTokens == 0 && totalTokens == 0) {
            return Optional.empty();
        }
        return Optional.of(new AiTokenUsage(promptTokens, completionTokens, totalTokens, "actual"));
    }

    private static Optional<AiTokenUsage> extractFromNativeUsage(Object nativeUsage) {
        if (nativeUsage == null) {
            return Optional.empty();
        }
        try {
            if (nativeUsage instanceof Map<?, ?> map) {
                return extractFromMap(map);
            }
            if (nativeUsage instanceof CharSequence cs) {
                String json = cs.toString();
                if (json.isBlank()) {
                    return Optional.empty();
                }
                JsonNode node = OBJECT_MAPPER.readTree(json);
                return extractFromJson(node);
            }
        } catch (Exception ignore) {
            return Optional.empty();
        }
        return Optional.empty();
    }

    private static Optional<AiTokenUsage> extractFromMap(Map<?, ?> map) {
        Object usageNode = getIgnoreCase(map, "usage");
        if (usageNode instanceof Map<?, ?> inner) {
            return extractFromMap(inner);
        }
        Integer prompt = asNonNegativeInt(getFirstIgnoreCase(map, "prompt_tokens", "input_tokens"));
        Integer completion = asNonNegativeInt(getFirstIgnoreCase(map, "completion_tokens", "output_tokens"));
        Integer total = asNonNegativeInt(getIgnoreCase(map, "total_tokens"));

        if (prompt == null && completion == null && total == null) {
            return Optional.empty();
        }
        int promptTokens = prompt == null ? 0 : prompt;
        int completionTokens = completion == null ? 0 : completion;
        int totalTokens = total == null ? promptTokens + completionTokens : total;
        if (promptTokens == 0 && completionTokens == 0 && totalTokens == 0) {
            return Optional.empty();
        }
        return Optional.of(new AiTokenUsage(promptTokens, completionTokens, totalTokens, "actual"));
    }

    private static Optional<AiTokenUsage> extractFromJson(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return Optional.empty();
        }
        JsonNode usage = node.has("usage") ? node.get("usage") : node;

        Integer prompt = asNonNegativeInt(getFirstIgnoreCase(usage, "prompt_tokens", "input_tokens"));
        Integer completion = asNonNegativeInt(getFirstIgnoreCase(usage, "completion_tokens", "output_tokens"));
        Integer total = asNonNegativeInt(getIgnoreCase(usage, "total_tokens"));

        if (prompt == null && completion == null && total == null) {
            return Optional.empty();
        }
        int promptTokens = prompt == null ? 0 : prompt;
        int completionTokens = completion == null ? 0 : completion;
        int totalTokens = total == null ? promptTokens + completionTokens : total;
        if (promptTokens == 0 && completionTokens == 0 && totalTokens == 0) {
            return Optional.empty();
        }
        return Optional.of(new AiTokenUsage(promptTokens, completionTokens, totalTokens, "actual"));
    }

    private static Object getFirstIgnoreCase(Map<?, ?> map, String first, String second) {
        Object value = getIgnoreCase(map, first);
        return value != null ? value : getIgnoreCase(map, second);
    }

    private static Object getIgnoreCase(Map<?, ?> map, String key) {
        if (map == null || key == null) {
            return null;
        }
        if (map.containsKey(key)) {
            return map.get(key);
        }
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getKey() == null) {
                continue;
            }
            if (key.equalsIgnoreCase(entry.getKey().toString())) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static JsonNode getFirstIgnoreCase(JsonNode node, String first, String second) {
        JsonNode value = getIgnoreCase(node, first);
        return value != null && !value.isMissingNode() ? value : getIgnoreCase(node, second);
    }

    private static JsonNode getIgnoreCase(JsonNode node, String key) {
        if (node == null || key == null || !node.isObject()) {
            return null;
        }
        JsonNode direct = node.get(key);
        if (direct != null) {
            return direct;
        }
        var fields = node.fields();
        while (fields.hasNext()) {
            var entry = fields.next();
            if (entry.getKey() != null && key.equalsIgnoreCase(entry.getKey())) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static Integer asNonNegativeInt(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Integer i) {
            return Math.max(i, 0);
        }
        if (value instanceof Long l) {
            return (int) Math.max(Math.min(l, (long) Integer.MAX_VALUE), 0L);
        }
        if (value instanceof Number n) {
            long v = n.longValue();
            return (int) Math.max(Math.min(v, (long) Integer.MAX_VALUE), 0L);
        }
        if (value instanceof CharSequence cs) {
            String s = cs.toString().trim();
            if (s.isEmpty()) {
                return null;
            }
            try {
                long v = Long.parseLong(s);
                return (int) Math.max(Math.min(v, (long) Integer.MAX_VALUE), 0L);
            } catch (NumberFormatException ignore) {
                return null;
            }
        }
        return null;
    }

    private static Integer asNonNegativeInt(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        if (node.isInt()) {
            return Math.max(node.intValue(), 0);
        }
        if (node.isLong()) {
            long v = node.longValue();
            return (int) Math.max(Math.min(v, (long) Integer.MAX_VALUE), 0L);
        }
        if (node.isNumber()) {
            long v = node.longValue();
            return (int) Math.max(Math.min(v, (long) Integer.MAX_VALUE), 0L);
        }
        if (node.isTextual()) {
            return asNonNegativeInt(node.textValue());
        }
        return null;
    }
}

