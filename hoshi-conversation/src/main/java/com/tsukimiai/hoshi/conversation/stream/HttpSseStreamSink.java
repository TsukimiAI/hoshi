package com.tsukimiai.hoshi.conversation.stream;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamError;

public class HttpSseStreamSink implements ChatStreamSink {

    private static final ObjectMapper OBJECT_MAPPER = JsonMapper.builder()
            .findAndAddModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .build();

    private final OutputStream outputStream;

    public HttpSseStreamSink(OutputStream outputStream) {
        this.outputStream = outputStream;
    }

    @Override
    public void emit(String event, Object data) throws IOException {
        String json = OBJECT_MAPPER.writeValueAsString(data);
        writeFrame("event:" + event + "\ndata:" + json + "\n\n");
    }

    @Override
    public void emitError(int code, String message) throws IOException {
        emit("error", new ChatStreamError(code, message));
    }

    private void writeFrame(String frame) throws IOException {
        outputStream.write(frame.getBytes(StandardCharsets.UTF_8));
        outputStream.flush();
    }
}
