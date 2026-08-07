package com.tsukimiai.hoshi.skill.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.document.Document;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.ai.vectorstore.VectorStore;

import com.tsukimiai.hoshi.skill.knowledge.config.KnowledgeChunkProperties;
import com.tsukimiai.hoshi.skill.knowledge.mapper.KnowledgeDocumentMapper;

@ExtendWith(MockitoExtension.class)
class KnowledgeIndexingServiceTest {

    @Mock
    private KnowledgeDocumentMapper mapper;

    @Mock
    private KnowledgeDocumentService documentService;

    @Mock
    private com.tsukimiai.hoshi.infrastructure.storage.ObjectStorageService objectStorageService;

    @Mock
    private VectorStore vectorStore;

    @Mock
    private ObjectProvider<ChatModel> chatModelProvider;

    @Test
    void addInBatchesUsesEmbeddingApiLimit() throws Exception {
        KnowledgeChunkProperties properties = new KnowledgeChunkProperties();
        KnowledgeDocumentSummarizer summarizer = new KnowledgeDocumentSummarizer(chatModelProvider, properties);
        KnowledgeIndexingService service = new KnowledgeIndexingService(
                mapper, documentService, objectStorageService, vectorStore, properties, summarizer);

        List<Document> documents = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            documents.add(new Document("chunk-" + i));
        }

        Method method = KnowledgeIndexingService.class.getDeclaredMethod("addInBatches", List.class);
        method.setAccessible(true);
        method.invoke(service, documents);

        ArgumentCaptor<List<Document>> captor = ArgumentCaptor.forClass(List.class);
        verify(vectorStore, times(3)).add(captor.capture());
        assertThat(captor.getAllValues().get(0)).hasSize(10);
        assertThat(captor.getAllValues().get(1)).hasSize(10);
        assertThat(captor.getAllValues().get(2)).hasSize(5);
    }
}
