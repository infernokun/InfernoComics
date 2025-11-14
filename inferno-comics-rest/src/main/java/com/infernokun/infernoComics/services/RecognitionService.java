package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.controllers.SeriesController;
import com.infernokun.infernoComics.models.RecognitionConfig;
import com.infernokun.infernoComics.models.StartedBy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.List;

@Slf4j
@Service
public class RecognitionService {
    private final SeriesService seriesService;
    private final WebClient webClient;

    private static final long SSE_TIMEOUT = Duration.ofMinutes(90).toMillis();
    private static final Duration PROGRESS_TTL = Duration.ofHours(2);

    public RecognitionService(SeriesService seriesService, InfernoComicsConfig infernoComicsConfig) {
        this.seriesService = seriesService;
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

    public void startReplay(String sessionId, Long seriesId, StartedBy startedBy, List<SeriesController.ImageData> imageDataList) {
        log.info("Replay image processing session: {}", sessionId);

        seriesService.startMultipleImagesProcessingWithProgress(sessionId, seriesId, imageDataList, startedBy, null, 0);
    }

    public JsonNode cleanSession(String sessionId) {
        return webClient.post()
                .uri(uriBuilder -> uriBuilder.path("/health/clean").build())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData("sessionId", sessionId))
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError,
                        clientResponse -> clientResponse.bodyToMono(String.class)
                                .flatMap(errorBody -> Mono.error(
                                        new RuntimeException("Client error: "
                                                + clientResponse.statusCode() + " - " + errorBody))))
                .onStatus(HttpStatusCode::is5xxServerError,
                        clientResponse -> clientResponse.bodyToMono(String.class)
                                .flatMap(errorBody -> Mono.error(
                                        new RuntimeException("Server error: "
                                                + clientResponse.statusCode() + " - " + errorBody))))
                .bodyToMono(JsonNode.class)
                .timeout(Duration.ofSeconds(30))
                .block();
    }

    public JsonNode getSessionJSON(String sessionId) {
        return webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/json")
                        .queryParam("sessionId", sessionId)
                        .build())
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, clientResponse -> clientResponse.bodyToMono(String.class)
                        .flatMap(errorBody -> Mono.error(
                                new RuntimeException("Client error: " + clientResponse.statusCode() + " - " + errorBody))))
                .onStatus(HttpStatusCode::is5xxServerError, clientResponse -> clientResponse.bodyToMono(String.class)
                        .flatMap(errorBody -> Mono.error(
                                new RuntimeException("Server error: " + clientResponse.statusCode() + " - " + errorBody))))
                .bodyToMono(JsonNode.class)
                .timeout(Duration.ofSeconds(30))
                .block();
    }

    public Resource getSessionImage(String sessionId, String fileName) {
        return webClient.get()
                .uri("/stored_images/" + sessionId + "/" + fileName)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, clientResponse ->
                        Mono.error(new RuntimeException("Image not found: " + fileName)))
                .onStatus(HttpStatusCode::is5xxServerError, serverResponse ->
                        Mono.error(new RuntimeException("Server error fetching image: " + fileName)))
                .bodyToMono(Resource.class)
                .timeout(Duration.ofSeconds(30))
                .block();
    }

    public List<SeriesController.ImageData> getSessionImages(String sessionId) {
        return webClient.get()
                .uri("/stored_images/" + sessionId + "/query")
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, clientResponse ->
                        Mono.error(new RuntimeException("Query images not found for session: " + sessionId)))
                .onStatus(HttpStatusCode::is5xxServerError, serverResponse ->
                        Mono.error(new RuntimeException("Server error fetching query images for session: " + sessionId)))
                .bodyToMono(new ParameterizedTypeReference<List<SeriesController.ImageData>>() {})
                .timeout(Duration.ofSeconds(30))
                .block();
    }

    public String getSessionImageHash(String sessionId, String fileName) {
        return webClient.get()
                .uri("/stored_images/hash/" + sessionId + "/" + fileName )
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, _ ->
                        Mono.error(new RuntimeException("Image hash not found: " + fileName)))
                .onStatus(HttpStatusCode::is5xxServerError, _ ->
                        Mono.error(new RuntimeException("Server error fetching image hash: " + fileName)))
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(30))
                .block();
    }
}
