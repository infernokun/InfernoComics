package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.RecognitionConfig;
import com.infernokun.infernoComics.repositories.ProgressDataRepository;
import com.infernokun.infernoComics.services.sync.WeirdService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

@Slf4j
@Service
public class RecognitionService {
    private final WebClient webClient;

    private static final long SSE_TIMEOUT = Duration.ofMinutes(90).toMillis();
    private static final Duration PROGRESS_TTL = Duration.ofHours(2);

    public RecognitionService(InfernoComicsConfig infernoComicsConfig) {
        this.webClient = WebClient.builder()
                .baseUrl("http://" + infernoComicsConfig.getRecognitionServerHost() + ":" + infernoComicsConfig.getRecognitionServerPort() + "/inferno-comics-recognition/api/v1")
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(500 * 1024 * 1024))
                        .build())
                .build();
    }

    public RecognitionConfig getRecognitionConfig() {
        return webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/config")
                        .build())
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, clientResponse -> clientResponse.bodyToMono(String.class)
                        .flatMap(errorBody -> Mono.error(
                                new RuntimeException("Client error: " + clientResponse.statusCode() + " - " + errorBody))))
                .onStatus(HttpStatusCode::is5xxServerError, clientResponse -> clientResponse.bodyToMono(String.class)
                        .flatMap(errorBody -> Mono.error(
                                new RuntimeException("Server error: " + clientResponse.statusCode() + " - " + errorBody))))
                .bodyToMono(RecognitionConfig.class)
                .timeout(Duration.ofSeconds(30))
                .block();
    }

    public Boolean saveRecognitionConfig(RecognitionConfig config) {
        return webClient.post()
                .uri(uriBuilder -> uriBuilder.path("/config").build())
                .bodyValue(config)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError,
                        clientResponse -> clientResponse.bodyToMono(String.class)
                                .flatMap(errorBody -> Mono.error(
                                        new RuntimeException(
                                                "Client error: " + clientResponse.statusCode()
                                                        + " - " + errorBody))))
                .onStatus(HttpStatusCode::is5xxServerError,
                        clientResponse -> clientResponse.bodyToMono(String.class)
                                .flatMap(errorBody -> Mono.error(
                                        new RuntimeException(
                                                "Server error: " + clientResponse.statusCode()
                                                        + " - " + errorBody))))
                .bodyToMono(Boolean.class)
                .timeout(Duration.ofSeconds(30))
                .block();
    }
}
