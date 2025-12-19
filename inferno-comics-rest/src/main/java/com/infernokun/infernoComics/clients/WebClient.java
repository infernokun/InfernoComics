package com.infernokun.infernoComics.clients;

import com.infernokun.infernoComics.config.InfernoComicsConfig;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.ExchangeStrategies;

import java.util.Base64;

@Component
public class WebClient {
    private final InfernoComicsConfig infernoComicsConfig;

    public WebClient(InfernoComicsConfig infernoComicsConfig1) {
        this.infernoComicsConfig = infernoComicsConfig1;
    }

    public org.springframework.web.reactive.function.client.WebClient recognitionClient() {
        return org.springframework.web.reactive.function.client.WebClient.builder()
                .baseUrl("http://" + infernoComicsConfig.getRecognitionServerHost() + ":" + infernoComicsConfig.getRecognitionServerPort() + "/inferno-comics-recognition/api/v1")
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(500 * 1024 * 1024))
                        .build())
                .build();
    }

    public org.springframework.web.reactive.function.client.WebClient groqClient() {
        return org.springframework.web.reactive.function.client.WebClient.builder()
                .baseUrl("https://api.groq.com/openai/v1/chat/completions")
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(1024 * 1024))
                        .build())
                .build();
    }

    public org.springframework.web.reactive.function.client.WebClient comicVineClient() {
        return org.springframework.web.reactive.function.client.WebClient.builder()
                .baseUrl("https://comicvine.gamespot.com/api")
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(1024 * 1024))
                        .build())
                .build();
    }

    public org.springframework.web.reactive.function.client.WebClient nextcloudClient() {
        return org.springframework.web.reactive.function.client.WebClient.builder()
                .baseUrl(infernoComicsConfig.getNextcloudUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, createAuthHeader())
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(500 * 1024 * 1024))
                        .build())
                .build();
    }

    private String createAuthHeader() {
        String credentials = infernoComicsConfig.getNextcloudUsername() + ":" +
                infernoComicsConfig.getNextcloudPassword();
        String encodedCredentials = Base64.getEncoder().encodeToString(credentials.getBytes());
        return "Basic " + encodedCredentials;
    }
}
