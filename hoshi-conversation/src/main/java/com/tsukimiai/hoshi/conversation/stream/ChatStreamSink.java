package com.tsukimiai.hoshi.conversation.stream;

import java.io.IOException;

public interface ChatStreamSink {

    void emit(String event, Object data) throws IOException;

    void emitError(int code, String message) throws IOException;
}
