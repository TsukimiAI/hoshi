package com.tsukimiai.hoshi.infrastructure.storage;

import java.io.InputStream;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import com.tsukimiai.hoshi.common.storage.StoredObject;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.errors.ErrorResponseException;
import jakarta.annotation.PostConstruct;

@Service
@ConditionalOnProperty(prefix = "hoshi.storage.minio", name = "enabled", havingValue = "true", matchIfMissing = true)
public class MinioObjectStorageService implements ObjectStorageService {

    private final HoshiStorageProperties properties;
    private MinioClient minioClient;

    public MinioObjectStorageService(HoshiStorageProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void init() {
        minioClient = MinioClient.builder()
                .endpoint(properties.getEndpoint())
                .credentials(properties.getAccessKey(), properties.getSecretKey())
                .build();
        ensureBucket();
    }

    @Override
    public void putObject(String key, InputStream inputStream, long size, String contentType) {
        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(properties.getBucket())
                    .object(key)
                    .stream(inputStream, size, -1)
                    .contentType(contentType)
                    .build());
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件上传失败");
        }
    }

    @Override
    public Optional<StoredObject> getObject(String key) {
        try {
            var stat = minioClient.statObject(StatObjectArgs.builder()
                    .bucket(properties.getBucket())
                    .object(key)
                    .build());
            InputStream inputStream = minioClient.getObject(GetObjectArgs.builder()
                    .bucket(properties.getBucket())
                    .object(key)
                    .build());
            String contentType = stat.contentType();
            if (contentType == null || contentType.isBlank()) {
                contentType = "application/octet-stream";
            }
            return Optional.of(new StoredObject(inputStream, contentType, stat.size()));
        } catch (ErrorResponseException exception) {
            if ("NoSuchKey".equals(exception.errorResponse().code())) {
                return Optional.empty();
            }
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件读取失败");
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件读取失败");
        }
    }

    @Override
    public void deleteObject(String key) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(properties.getBucket())
                    .object(key)
                    .build());
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "文件删除失败");
        }
    }

    @Override
    public String buildPublicUrl(String key) {
        String base = properties.getPublicBaseUrl().replaceAll("/$", "");
        return base + "/" + key;
    }

    @Override
    public String resolveStorageKey(String publicUrl) {
        if (publicUrl == null || publicUrl.isBlank()) {
            return null;
        }
        String prefix = properties.getPublicBaseUrl().replaceAll("/$", "") + "/";
        if (!publicUrl.startsWith(prefix)) {
            return null;
        }
        return publicUrl.substring(prefix.length());
    }

    private void ensureBucket() {
        try {
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder()
                    .bucket(properties.getBucket())
                    .build());
            if (!exists) {
                minioClient.makeBucket(MakeBucketArgs.builder()
                        .bucket(properties.getBucket())
                        .build());
            }
        } catch (Exception exception) {
            throw new IllegalStateException("无法初始化 MinIO bucket: " + properties.getBucket(), exception);
        }
    }

}
