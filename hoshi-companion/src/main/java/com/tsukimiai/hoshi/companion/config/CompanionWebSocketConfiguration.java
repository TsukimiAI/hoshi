package com.tsukimiai.hoshi.companion.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import com.tsukimiai.hoshi.companion.ws.HoshiWebSocketHandler;

@Configuration
@EnableWebSocket
public class CompanionWebSocketConfiguration implements WebSocketConfigurer {

    private final HoshiWebSocketHandler hoshiWebSocketHandler;

    public CompanionWebSocketConfiguration(HoshiWebSocketHandler hoshiWebSocketHandler) {
        this.hoshiWebSocketHandler = hoshiWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(hoshiWebSocketHandler, "/ws/pet")
                .setAllowedOrigins("*");
    }

}
