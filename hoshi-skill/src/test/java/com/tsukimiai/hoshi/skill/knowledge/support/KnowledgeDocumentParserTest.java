package com.tsukimiai.hoshi.skill.knowledge.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;

import org.junit.jupiter.api.Test;

class KnowledgeDocumentParserTest {

    @Test
    void parsesTextAsUtf8() throws Exception {
        KnowledgeDocumentParser parser = new KnowledgeDocumentParser();
        String text = parser.parse("note.txt", "text/plain", new ByteArrayInputStream("你好".getBytes(java.nio.charset.StandardCharsets.UTF_8)));

        assertThat(text).contains("你好");
    }
}

