package com.tsukimiai.hoshi.skill.knowledge.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.infrastructure.storage.ObjectStorageService;
import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocument;
import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocumentStatus;
import com.tsukimiai.hoshi.skill.knowledge.mapper.KnowledgeDocumentMapper;

@Service
@Transactional(readOnly = true)
public class KnowledgeDocumentService {

    private static final long MAX_UPLOAD_BYTES = 20L * 1024 * 1024;

    private final KnowledgeDocumentMapper mapper;
    private final ObjectStorageService objectStorageService;

    public KnowledgeDocumentService(KnowledgeDocumentMapper mapper, ObjectStorageService objectStorageService) {
        this.mapper = mapper;
        this.objectStorageService = objectStorageService;
    }

    @Transactional
    public KnowledgeDocument upload(Long userId, MultipartFile file) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "userId 不能为空");
        }
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "文件不能为空");
        }
        if (file.getSize() > MAX_UPLOAD_BYTES) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "文件过大（最大 20MB）");
        }
        String originalFilename = StringUtils.hasText(file.getOriginalFilename())
                ? file.getOriginalFilename().trim()
                : "upload";
        String ext = resolveExtension(originalFilename);
        if (!isSupportedExtension(ext)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "暂不支持该文件格式（仅支持 md/txt/pdf）");
        }
        String contentType = StringUtils.hasText(file.getContentType()) ? file.getContentType().trim() : "application/octet-stream";

        KnowledgeDocument doc = new KnowledgeDocument();
        doc.setUserId(userId);
        doc.setFilename(originalFilename);
        doc.setContentType(contentType);
        doc.setStorageKey("pending");
        doc.setStatus(KnowledgeDocumentStatus.UPLOADED.name());
        doc.setChunkCount(0);
        doc.setErrorMessage(null);
        LocalDateTime now = LocalDateTime.now();
        doc.setCreatedAt(now);
        doc.setUpdatedAt(now);
        mapper.insert(doc);

        String storageKey = buildStorageKey(userId, doc.getId(), originalFilename);
        try {
            objectStorageService.putObject(storageKey, file.getInputStream(), file.getSize(), contentType);
        } catch (Exception ex) {
            doc.setStatus(KnowledgeDocumentStatus.FAILED.name());
            doc.setErrorMessage("上传失败：" + ex.getMessage());
            doc.setUpdatedAt(LocalDateTime.now());
            mapper.updateById(doc);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件上传失败");
        }
        doc.setStorageKey(storageKey);
        doc.setUpdatedAt(LocalDateTime.now());
        mapper.updateById(doc);
        return doc;
    }

    public KnowledgeDocument get(Long userId, Long documentId) {
        if (userId == null || documentId == null) {
            return null;
        }
        KnowledgeDocument doc = mapper.selectById(documentId);
        if (doc == null || !Objects.equals(doc.getUserId(), userId)) {
            return null;
        }
        return doc;
    }

    public List<KnowledgeDocument> list(Long userId, int limit) {
        if (userId == null || userId <= 0) {
            return List.of();
        }
        int effectiveLimit = Math.max(1, Math.min(limit, 200));
        return mapper.selectList(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<KnowledgeDocument>()
                        .eq(KnowledgeDocument::getUserId, userId)
                        .orderByDesc(KnowledgeDocument::getUpdatedAt)
                        .last("LIMIT " + effectiveLimit));
    }

    @Transactional
    public void markIndexing(Long documentId) {
        KnowledgeDocument doc = mapper.selectById(documentId);
        if (doc == null) {
            return;
        }
        doc.setStatus(KnowledgeDocumentStatus.INDEXING.name());
        doc.setErrorMessage(null);
        doc.setUpdatedAt(LocalDateTime.now());
        mapper.updateById(doc);
    }

    @Transactional
    public void markReady(Long documentId, int chunkCount) {
        KnowledgeDocument doc = mapper.selectById(documentId);
        if (doc == null) {
            return;
        }
        doc.setStatus(KnowledgeDocumentStatus.READY.name());
        doc.setChunkCount(Math.max(0, chunkCount));
        doc.setErrorMessage(null);
        doc.setUpdatedAt(LocalDateTime.now());
        mapper.updateById(doc);
    }

    @Transactional
    public void markFailed(Long documentId, String errorMessage) {
        KnowledgeDocument doc = mapper.selectById(documentId);
        if (doc == null) {
            return;
        }
        doc.setStatus(KnowledgeDocumentStatus.FAILED.name());
        doc.setErrorMessage(StringUtils.hasText(errorMessage) ? errorMessage.trim() : "索引失败");
        doc.setUpdatedAt(LocalDateTime.now());
        mapper.updateById(doc);
    }

    private String buildStorageKey(Long userId, Long documentId, String filename) {
        String safeName = filename.replaceAll("[\\\\/]", "_");
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        return "knowledge/" + userId + "/" + documentId + "/" + suffix + "_" + safeName;
    }

    private boolean isSupportedExtension(String ext) {
        return "md".equals(ext) || "txt".equals(ext) || "pdf".equals(ext);
    }

    private String resolveExtension(String filename) {
        String name = filename == null ? "" : filename.trim();
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) {
            return "";
        }
        return name.substring(dot + 1).trim().toLowerCase(Locale.ROOT);
    }
}

