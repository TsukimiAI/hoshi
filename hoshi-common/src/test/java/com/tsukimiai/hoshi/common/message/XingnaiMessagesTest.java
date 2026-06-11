package com.tsukimiai.hoshi.common.message;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.tsukimiai.hoshi.common.exception.ErrorCode;

class XingnaiMessagesTest {

    @Test
    void replacesGenericSystemMessageWithFriendlyCopy() {
        assertThat(XingnaiMessages.forErrorCode(ErrorCode.CHAT_AI_UNAVAILABLE, "系统内部错误"))
                .isEqualTo(XingnaiMessages.aiUnavailable());
    }

    @Test
    void keepsCustomBusinessMessageWhenProvided() {
        assertThat(XingnaiMessages.forErrorCode(ErrorCode.BAD_REQUEST, "现在没有可以重试的消息哦，先跟我说点什么吧。"))
                .isEqualTo("现在没有可以重试的消息哦，先跟我说点什么吧。");
    }
}
