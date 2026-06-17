package com.tsukimiai.hoshi.ai.metrics;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AiTokenEstimatorTest {

    @Test
    void emptyTextReturnsZero() {
        assertThat(AiTokenEstimator.estimateTokens(null)).isZero();
        assertThat(AiTokenEstimator.estimateTokens("   ")).isZero();
    }

    @Test
    void estimatesTokensForChineseAndAscii() {
        int chinese = AiTokenEstimator.estimateTokens("老师今天好累");
        int ascii = AiTokenEstimator.estimateTokens("hello world");
        int mixed = AiTokenEstimator.estimateTokens("老师 hello world");

        assertThat(chinese).isGreaterThan(0);
        assertThat(ascii).isGreaterThan(0);
        assertThat(mixed).isGreaterThanOrEqualTo(Math.max(chinese, ascii));
    }
}

