package com.infernokun.infernoComics.config.web;

import com.infernokun.infernoComics.clients.InfernoComicsSocketClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    @Bean
    public InfernoComicsSocketClient socketHandler() {
        return new InfernoComicsSocketClient();
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(socketHandler(), "/socket-handler/update").setAllowedOrigins("*");
    }

}
