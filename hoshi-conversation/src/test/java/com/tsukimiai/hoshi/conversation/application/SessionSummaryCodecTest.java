package com.tsukimiai.hoshi.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.tsukimiai.hoshi.conversation.entity.ChatSession;

class SessionSummaryCodecTest {

    private final SessionSummaryCodec codec = new SessionSummaryCodec();

    @Test
    void hydratesSummaryWhenSessionHasContent() {
        ChatSession session = new ChatSession();
        session.setSummaryVersion(2);
        session.setCompressedUntilMessageId(10L);
        session.setSummary("用户喜欢猫");
        session.setSummaryFacts(codec.writeStringList(List.of("养了两只猫")));
        session.setSummaryDecisions(codec.writeStringList(List.of("周末去猫咖")));
        session.setSummaryOpenLoops(codec.writeStringList(List.of("还没决定猫粮品牌")));

        var summary = codec.hydrateSessionSummary(session);

        assertThat(summary).isNotNull();
        assertThat(summary.summaryText()).isEqualTo("用户喜欢猫");
        assertThat(summary.facts()).containsExactly("养了两只猫");
        assertThat(summary.decisions()).containsExactly("周末去猫咖");
        assertThat(summary.openLoops()).containsExactly("还没决定猫粮品牌");
    }

    @Test
    void returnsNullWhenSessionSummaryIsEmpty() {
        ChatSession session = new ChatSession();
        assertThat(codec.hydrateSessionSummary(session)).isNull();
    }
}
