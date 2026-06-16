package com.tsukimiai.hoshi.conversation.application.proactive;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.tsukimiai.hoshi.common.companion.CompanionEmotion;
import com.tsukimiai.hoshi.conversation.entity.ProactiveSourceType;

class ProactiveEmotionResolverTest {

    @Test
    void resolvesOpenLoopAsExpect() {
        assertThat(ProactiveEmotionResolver.resolve(ProactiveSourceType.OPEN_LOOP, null))
                .isEqualTo(CompanionEmotion.EXPECT);
    }

    @Test
    void resolvesMoodAsSad() {
        assertThat(ProactiveEmotionResolver.resolve(ProactiveSourceType.MEMORY, "mood"))
                .isEqualTo(CompanionEmotion.SAD);
    }

    @Test
    void resolvesPlanAsHappy() {
        assertThat(ProactiveEmotionResolver.resolve(ProactiveSourceType.MEMORY, "plan"))
                .isEqualTo(CompanionEmotion.HAPPY);
    }

    @Test
    void resolveOpeningUsesLlmEmotionWhenAllowed() {
        assertThat(ProactiveEmotionResolver.resolveOpening("shy", ProactiveSourceType.MEMORY, "mood"))
                .isEqualTo(CompanionEmotion.SHY);
        assertThat(ProactiveEmotionResolver.resolveOpening("HAPPY", ProactiveSourceType.OPEN_LOOP, null))
                .isEqualTo(CompanionEmotion.HAPPY);
    }

    @Test
    void resolveOpeningFallsBackWhenLlmEmotionInvalid() {
        assertThat(ProactiveEmotionResolver.resolveOpening("sad", ProactiveSourceType.MEMORY, "mood"))
                .isEqualTo(CompanionEmotion.SAD);
        assertThat(ProactiveEmotionResolver.resolveOpening(null, ProactiveSourceType.OPEN_LOOP, null))
                .isEqualTo(CompanionEmotion.EXPECT);
        assertThat(ProactiveEmotionResolver.resolveOpening("angry", ProactiveSourceType.MEMORY, "plan"))
                .isEqualTo(CompanionEmotion.HAPPY);
    }
}
