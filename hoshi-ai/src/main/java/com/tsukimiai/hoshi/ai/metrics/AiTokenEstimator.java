package com.tsukimiai.hoshi.ai.metrics;

/**
 * Lightweight token estimation to enable Prometheus accounting when provider usage is unavailable.
 * This is intentionally approximate and MUST be tagged with source=estimated.
 */
public final class AiTokenEstimator {

    private AiTokenEstimator() {
    }

    public static int estimateTokens(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        int cjk = 0;
        int other = 0;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            i += Character.charCount(cp);
            if (isCjk(cp)) {
                cjk++;
            } else if (!Character.isWhitespace(cp)) {
                other++;
            }
        }
        // Rough heuristic:
        // - CJK tends to be ~1 token per ~1-2 chars
        // - Non-CJK tends to be ~1 token per ~3-4 chars
        double tokens = Math.ceil(cjk / 1.5d) + Math.ceil(other / 4.0d);
        return (int) Math.max(tokens, 0);
    }

    private static boolean isCjk(int codePoint) {
        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        return script == Character.UnicodeScript.HAN
                || script == Character.UnicodeScript.HIRAGANA
                || script == Character.UnicodeScript.KATAKANA
                || script == Character.UnicodeScript.HANGUL;
    }
}

