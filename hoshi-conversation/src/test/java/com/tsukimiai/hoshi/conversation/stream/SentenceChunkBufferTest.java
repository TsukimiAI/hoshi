package com.tsukimiai.hoshi.conversation.stream;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SentenceChunkBufferTest {

    @Test
    void splitsNaturalChineseSentences() {
        SentenceChunkBuffer buffer = new SentenceChunkBuffer();

        List<String> first = buffer.append("太好了，我们出发吧。等等");
        List<String> second = buffer.append("，你刚才是说明天吗？");

        assertThat(first).containsExactly("太好了，我们出发吧。");
        assertThat(second).containsExactly("等等，你刚才是说明天吗？");
    }

    @Test
    void flushesLongSentenceWhenNoPunctuation() {
        SentenceChunkBuffer buffer = new SentenceChunkBuffer(8);

        List<String> segments = buffer.append("这是一个很长很长但是暂时没有句号");

        assertThat(segments).isNotEmpty();
        assertThat(String.join("", segments) + String.join("", buffer.flushRemaining()))
                .isEqualTo("这是一个很长很长但是暂时没有句号");
    }

    @Test
    void keepsTrailingClosersWithSentence() {
        SentenceChunkBuffer buffer = new SentenceChunkBuffer();

        List<String> segments = buffer.append("她笑着说：“当然可以！”然后挥了挥手");

        assertThat(segments).containsExactly("她笑着说：“当然可以！”");
        assertThat(buffer.flushRemaining()).containsExactly("然后挥了挥手");
    }

    @Test
    void splitsOnTildeSoftBreak() {
        SentenceChunkBuffer buffer = new SentenceChunkBuffer();

        List<String> segments = buffer.append("你好～老师今天");

        assertThat(segments).containsExactly("你好～");
        assertThat(buffer.flushRemaining()).containsExactly("老师今天");
    }

    @Test
    void preservesMarkdownNewlinesInsideSegments() {
        SentenceChunkBuffer buffer = new SentenceChunkBuffer();

        List<String> segments = buffer.append("""
                先看例子：

                ```java
                System.out.println("hi");
                ```
                这样就很清楚了。
                """);

        assertThat(segments).singleElement().satisfies(segment -> {
            assertThat(segment).contains("```java");
            assertThat(segment).contains("System.out.println(\"hi\");");
            assertThat(segment).contains("这样就很清楚了。");
        });
    }
}
