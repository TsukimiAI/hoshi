package com.tsukimiai.hoshi.skill.knowledge.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;

import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocument;
import com.tsukimiai.hoshi.skill.knowledge.service.KnowledgeAdminService;
import com.tsukimiai.hoshi.skill.knowledge.service.KnowledgeDocumentService;
import com.tsukimiai.hoshi.skill.knowledge.service.KnowledgeIndexingDispatcher;

class KnowledgeDocumentControllerUnitTest {

    @Test
    void uploadEnqueuesIndexing() {
        KnowledgeDocumentService docService = Mockito.mock(KnowledgeDocumentService.class);
        KnowledgeIndexingDispatcher dispatcher = Mockito.mock(KnowledgeIndexingDispatcher.class);
        KnowledgeAdminService adminService = Mockito.mock(KnowledgeAdminService.class);
        KnowledgeDocumentController controller = new KnowledgeDocumentController(docService, dispatcher, adminService);

        KnowledgeDocument doc = new KnowledgeDocument();
        doc.setId(10L);
        doc.setUserId(1L);
        doc.setFilename("a.txt");
        doc.setContentType("text/plain");
        doc.setStorageKey("knowledge/1/10/a.txt");
        doc.setStatus("UPLOADED");
        doc.setChunkCount(0);
        doc.setCreatedAt(LocalDateTime.now());
        doc.setUpdatedAt(LocalDateTime.now());

        when(docService.upload(eq(1L), any())).thenReturn(doc);
        when(docService.get(1L, 10L)).thenReturn(doc);

        MockMultipartFile file = new MockMultipartFile("file", "a.txt", "text/plain", "hello".getBytes());

        var response = controller.upload(1L, file);

        assertThat(response.data()).isNotNull();
        verify(docService).markIndexing(10L);
        verify(dispatcher).enqueue(1L, 10L);
    }

    @Test
    void deleteDelegatesToAdminService() {
        KnowledgeDocumentService docService = Mockito.mock(KnowledgeDocumentService.class);
        KnowledgeIndexingDispatcher dispatcher = Mockito.mock(KnowledgeIndexingDispatcher.class);
        KnowledgeAdminService adminService = Mockito.mock(KnowledgeAdminService.class);
        KnowledgeDocumentController controller = new KnowledgeDocumentController(docService, dispatcher, adminService);

        controller.delete(1L, 10L);

        verify(adminService).delete(1L, 10L);
    }

    @Test
    void reindexDelegatesToAdminService() {
        KnowledgeDocumentService docService = Mockito.mock(KnowledgeDocumentService.class);
        KnowledgeIndexingDispatcher dispatcher = Mockito.mock(KnowledgeIndexingDispatcher.class);
        KnowledgeAdminService adminService = Mockito.mock(KnowledgeAdminService.class);
        KnowledgeDocumentController controller = new KnowledgeDocumentController(docService, dispatcher, adminService);

        KnowledgeDocument doc = new KnowledgeDocument();
        doc.setId(10L);
        doc.setUserId(1L);
        when(adminService.reindex(1L, 10L)).thenReturn(doc);

        var response = controller.reindex(1L, 10L);

        assertThat(response.data()).isNotNull();
        verify(adminService).reindex(1L, 10L);
    }
}

