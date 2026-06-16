package com.tsukimiai.hoshi.common.storage;

import java.io.InputStream;

public record StoredObject(InputStream inputStream, String contentType, long size) {
}
