package com.tsukimiai.hoshi.skill.knowledge.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeChunkKinds;

class MarkdownStructureChunkerTest {

    private final MarkdownStructureChunker chunker = new MarkdownStructureChunker(1200, 200);

    @Test
    void splitsMarkdownByHeadings() {
        String markdown = """
                # Redis
                Redis 是内存数据库。

                ## 持久化
                RDB 和 AOF 两种方式。

                ### AOF
                追加写日志。
                """;

        List<StructuredChunk> chunks = chunker.chunk("redis.md", markdown);

        assertThat(chunks).hasSizeGreaterThanOrEqualTo(3);
        List<String> headingPaths = chunks.stream().map(StructuredChunk::headingPath).distinct().toList();
        assertThat(headingPaths).anyMatch(path -> path.contains("Redis"));
        assertThat(headingPaths).anyMatch(path -> path.contains("持久化"));
        assertThat(chunks).allMatch(chunk -> KnowledgeChunkKinds.CONTENT.equals(chunk.chunkKind()));
    }

    @Test
    void keepsCodeFenceIntact() {
        String markdown = """
                # Demo
                示例代码：

                ```java
                public class A {
                # not a heading
                }
                ```

                结束。
                """;

        List<StructuredChunk> chunks = chunker.chunk("demo.md", markdown);

        assertThat(chunks).hasSize(1);
        assertThat(chunks.get(0).content()).contains("# not a heading");
    }

    @Test
    void splitsLongSectionWithTextChunker() {
        String body = "长".repeat(1500);
        String markdown = "# 超长章节\n" + body;

        List<StructuredChunk> chunks = chunker.chunk("long.md", markdown);

        assertThat(chunks.size()).isGreaterThan(1);
        assertThat(chunks).allMatch(chunk -> chunk.headingPath().contains("超长章节"));
    }

    @Test
    void plainTextFallsBackWithoutHeadingPath() {
        List<StructuredChunk> chunks = chunker.chunk("notes.txt", "第一行\n第二行");

        assertThat(chunks).hasSize(1);
        assertThat(chunks.get(0).headingPath()).isEmpty();
        assertThat(chunks.get(0).docTitle()).isEqualTo("notes");
    }
}
