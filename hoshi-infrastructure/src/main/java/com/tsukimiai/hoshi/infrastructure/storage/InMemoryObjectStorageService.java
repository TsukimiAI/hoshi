package com.tsukimiai.hoshi.infrastructure.storage;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import com.tsukimiai.hoshi.common.storage.StoredObject;

@Service
@ConditionalOnProperty(prefix = "hoshi.storage.minio", name = "enabled", havingValue = "false")
public class InMemoryObjectStorageService implements ObjectStorageService {

    private final HoshiStorageProperties properties;
    private final Map<String, byte[]> objects = new ConcurrentHashMap<>();

    public InMemoryObjectStorageService(HoshiStorageProperties properties) {
        this.properties = properties;
    }

    @Override
    public void putObject(String key, InputStream inputStream, long size, String contentType) {
        try {
            objects.put(key, inputStream.readAllBytes());
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to store object in memory", exception);
        }
    }

    @Override
    public Optional<StoredObject> getObject(String key) {
        byte[] bytes = objects.get(key);
        if (bytes == null) {
            return Optional.empty();
        }
        return Optional.of(new StoredObject(
                new ByteArrayInputStream(bytes),
                contentTypeForKey(key),
                bytes.length));
    }

    @Override
    public void deleteObject(String key) {
        objects.remove(key);
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

    private String contentTypeForKey(String key) {
        String lowerKey = key.toLowerCase(Locale.ROOT);
        if (lowerKey.endsWith(".png")) {
            return "image/png";
        }
        if (lowerKey.endsWith(".webp")) {
            return "image/webp";
        }
        return "image/jpeg";
    }

}
