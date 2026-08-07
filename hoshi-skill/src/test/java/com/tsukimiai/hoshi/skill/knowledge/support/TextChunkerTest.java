package com.tsukimiai.hoshi.skill.knowledge.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TextChunkerTest {

    @Test
    void chunkSplitsWithOverlap() {
        TextChunker chunker = new TextChunker(10, 2);
        var chunks = chunker.chunk("0123456789abcdef");

        assertThat(chunks).isNotEmpty();
        assertThat(chunks.get(0)).contains("0123456789");
    }
}

