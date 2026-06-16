package com.tsukimiai.hoshi.conversation.support;

import java.io.IOException;

public final class StreamClientClosedException extends RuntimeException {

    public StreamClientClosedException(IOException cause) {
        super(cause);
    }
}
