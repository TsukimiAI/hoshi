package com.tsukimiai.hoshi.infrastructure.storage;

import java.io.InputStream;
import java.util.Optional;

import com.tsukimiai.hoshi.common.storage.StoredObject;

public interface ObjectStorageService {

    void putObject(String key, InputStream inputStream, long size, String contentType);

    Optional<StoredObject> getObject(String key);

    void deleteObject(String key);

    String buildPublicUrl(String key);

    String resolveStorageKey(String publicUrl);

}
