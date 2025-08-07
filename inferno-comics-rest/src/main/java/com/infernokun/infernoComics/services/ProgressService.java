package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.ProgressData;
import com.infernokun.infernoComics.repositories.ProgressDataRepository;
import lombok.Builder;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class ProgressService {

    private final Map<String, SseEmitter> activeEmitters = new ConcurrentHashMap<>();
    private final Map<String, SSEProgressData> sessionStatus = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final ProgressDataRepository progressDataRepository;
    private final WebClient webClient;

    // SSE timeout: 30 minutes (should be enough for image processing)
    private static final long SSE_TIMEOUT = 30 * 60 * 1000L;

    public ProgressService(ProgressDataRepository progressDataRepository, InfernoComicsConfig infernoComicsConfig) {
        this.progressDataRepository = progressDataRepository;
        this.webClient = WebClient.builder()
                .baseUrl("http://" + infernoComicsConfig.getRecognitionServerHost() + ":" + infernoComicsConfig.getRecognitionServerPort() + "/inferno-comics-recognition/api/v1")
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(500 * 1024 * 1024))
                        .build())
                .build();
    }

    public boolean emitterIsPresent(String sessionId) {
        return activeEmitters.containsKey(sessionId);
    }

    public SseEmitter createProgressEmitter(String sessionId) {
        log.info("Creating SSE emitter for session: {}", sessionId);

        // Check if session exists
        if (!sessionStatus.containsKey(sessionId)) {
            log.error("Session {} not found in sessionStatus. Available sessions: {}",
                    sessionId, sessionStatus.keySet());
            throw new IllegalArgumentException("Session not found: " + sessionId);
        }

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);
        activeEmitters.put(sessionId, emitter);

        log.info("SSE emitter created and stored for session: {}", sessionId);

        // Set up emitter completion and error handlers
        emitter.onCompletion(() -> {
            log.info("SSE emitter completed for session: {}", sessionId);
            cleanupSession(sessionId);
        });

        emitter.onTimeout(() -> {
            log.warn("SSE emitter timed out for session: {}", sessionId);
            cleanupSession(sessionId);
        });

        emitter.onError((throwable) -> {
            log.error("SSE emitter error for session {}: {}", sessionId, throwable.getMessage(), throwable);
            cleanupSession(sessionId);
        });

        // Send initial connection confirmation
        try {
            SSEProgressData initialData = SSEProgressData.builder()
                    .type("progress")
                    .sessionId(sessionId)
                    .stage("connected")
                    .progress(0)
                    .message("Connected to progress stream")
                    .timestamp(Instant.now().toEpochMilli())
                    .build();

            log.info("Sending initial SSE event for session: {}", sessionId);
            sendEvent(emitter, initialData);
            log.info("Initial SSE event sent successfully for session: {}", sessionId);

        } catch (Exception e) {
            log.error("Failed to send initial SSE event for session {}: {}", sessionId, e.getMessage(), e);
            cleanupSession(sessionId);
            throw new RuntimeException("Failed to initialize SSE connection", e);
        }

        return emitter;
    }

    public ProgressData initializeSession(String sessionId, Long seriesId) {
        log.info("Initializing processing session: {}", sessionId);

        SSEProgressData initialStatus = SSEProgressData.builder()
                .type("progress")
                .sessionId(sessionId)
                .stage("preparing")
                .progress(0)
                .message("Session initialized, waiting for processing...")
                .timestamp(Instant.now().toEpochMilli())
                .build();

        sessionStatus.put(sessionId, initialStatus);
        log.info("Session {} initialized and stored in sessionStatus", sessionId);

        ProgressData progressData = new ProgressData();
        progressData.setState(ProgressData.State.PROCESSING);
        progressData.setSessionId(sessionId);
        progressData.setTimeStarted(LocalDateTime.now());
        progressData.setSeriesId(seriesId);

        return progressDataRepository.save(progressData);
    }

    public void updateProgress(String sessionId, String stage, int progress, String message) {
        log.debug("Updating progress for session {}: stage={}, progress={}%, message={}",
                sessionId, stage, progress, message);

        SSEProgressData progressData = SSEProgressData.builder()
                .type("progress")
                .sessionId(sessionId)
                .stage(stage)
                .progress(progress)
                .message(message)
                .timestamp(Instant.now().toEpochMilli())
                .build();

        sessionStatus.put(sessionId, progressData);
        sendToEmitter(sessionId, progressData);
    }

    public void sendComplete(String sessionId, JsonNode result) {
        log.info("Sending completion event for session: {}", sessionId);

        // Ensure the result is properly formatted as ImageMatcherResponse
        if (result != null) {
            log.info("Completion result for session {}: top_matches={}, total_matches={}",
                    sessionId,
                    result.has("top_matches") ? result.get("top_matches").size() : "missing",
                    result.has("total_matches") ? result.get("total_matches").asInt() : "missing");

            // Check result size to prevent SSE issues with large payloads
            try {
                String resultJson = objectMapper.writeValueAsString(result);
                int resultSize = resultJson.length();
                log.info("Result JSON size for session {}: {} characters", sessionId, resultSize);

                if (resultSize > 50000) { // 50KB limit
                    log.warn("Large result payload for session {}: {} chars, truncating top_matches",
                            sessionId, resultSize);

                    // Truncate top_matches to prevent SSE issues
                    if (result.has("top_matches") && result.get("top_matches").isArray()) {
                        ObjectNode modifiedResult = (ObjectNode) result;
                        JsonNode topMatches = result.get("top_matches");

                        // Keep only first 3 matches to reduce size
                        if (topMatches.size() > 3) {
                            log.info("Truncating top_matches from {} to 3 for session {}",
                                    topMatches.size(), sessionId);

                            ArrayNode truncatedMatches = objectMapper.createArrayNode();
                            for (int i = 0; i < Math.min(3, topMatches.size()); i++) {
                                truncatedMatches.add(topMatches.get(i));
                            }
                            modifiedResult.set("top_matches", truncatedMatches);
                            modifiedResult.put("truncated", true);
                            modifiedResult.put("original_match_count", topMatches.size());

                            result = modifiedResult;
                        }
                    }
                }
            } catch (Exception e) {
                log.error("Error checking result size for session {}: {}", sessionId, e.getMessage());
            }
        }

        Optional<ProgressData> progressDataOptional = progressDataRepository.findBySessionId(sessionId);

        if (progressDataOptional.isPresent()) {
            ProgressData progressData = progressDataOptional.get();
            progressData.setTimeFinished(LocalDateTime.now());
            progressData.setState(ProgressData.State.COMPLETE);
            progressDataRepository.save(progressData);
        }

        SSEProgressData completeData = SSEProgressData.builder()
                .type("complete")
                .sessionId(sessionId)
                .stage("complete")
                .progress(100)
                .message("Image processing completed successfully")
                .result(result)
                .timestamp(Instant.now().toEpochMilli())
                .build();

        sessionStatus.put(sessionId, completeData);

        try {
            sendToEmitter(sessionId, completeData);
            log.info("Completion event sent successfully for session: {}", sessionId);
        } catch (Exception e) {
            log.error("Failed to send completion event for session {}: {}", sessionId, e.getMessage(), e);
        }

        // Complete the emitter after a short delay to allow client to receive the final event
        scheduleEmitterCompletion(sessionId, 1000);
    }

    public void sendError(String sessionId, String errorMessage) {
        log.error("Sending error event for session {}: {}", sessionId, errorMessage);

        SSEProgressData errorData = SSEProgressData.builder()
                .type("error")
                .sessionId(sessionId)
                .error(errorMessage)
                .timestamp(Instant.now().toEpochMilli())
                .build();

        sessionStatus.put(sessionId, errorData);
        sendToEmitter(sessionId, errorData);

        // Complete the emitter after a short delay
        scheduleEmitterCompletion(sessionId, 2000);
    }

    public Map<String, Object> getSessionStatus(String sessionId) {
        SSEProgressData status = sessionStatus.get(sessionId);
        if (status == null) {
            return Map.of(
                    "sessionId", sessionId,
                    "status", "not_found",
                    "message", "Session not found"
            );
        }

        return Map.of(
                "sessionId", sessionId,
                "type", status.getType(),
                "stage", status.getStage() != null ? status.getStage() : "",
                "progress", status.getProgress() != null ? status.getProgress() : 0,
                "message", status.getMessage() != null ? status.getMessage() : "",
                "timestamp", status.getTimestamp(),
                "hasEmitter", activeEmitters.containsKey(sessionId)
        );
    }

    private void sendToEmitter(String sessionId, SSEProgressData data) {
        SseEmitter emitter = activeEmitters.get(sessionId);
        if (emitter != null) {
            try {
                log.info("Sending SSE event to session {}: type={}, stage={}, progress={}",
                        sessionId, data.getType(), data.getStage(), data.getProgress());
                sendEvent(emitter, data);
                log.info("SSE event sent successfully to session: {}", sessionId);
            } catch (Exception e) {
                log.error("Failed to send SSE event to session {}: {}", sessionId, e.getMessage(), e);
                cleanupSession(sessionId);
            }
        } else {
            log.warn("No active emitter found for session: {}", sessionId);
        }
    }

    private void sendEvent(SseEmitter emitter, SSEProgressData data) throws IOException {
        String jsonData = objectMapper.writeValueAsString(data);

        // Log the event being sent for debugging
        log.debug("Sending SSE event: type={}, stage={}, progress={}, message={}",
                data.getType(), data.getStage(), data.getProgress(), data.getMessage());

        // Send with proper SSE format
        emitter.send(SseEmitter.event()
                .name("progress") // Event name
                .data(jsonData)   // JSON data
                .reconnectTime(1000)); // Reconnect time in ms
    }

    private void scheduleEmitterCompletion(String sessionId, long delayMs) {
        new Thread(() -> {
            try {
                Thread.sleep(delayMs);
                SseEmitter emitter = activeEmitters.get(sessionId);
                if (emitter != null) {
                    emitter.complete();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.warn("Emitter completion scheduling interrupted for session: {}", sessionId);
            } catch (Exception e) {
                log.error("Error completing emitter for session {}: {}", sessionId, e.getMessage());
            }
        }).start();
    }

    private void cleanupSession(String sessionId) {
        log.debug("Cleaning up session: {}", sessionId);

        SseEmitter emitter = activeEmitters.remove(sessionId);
        if (emitter != null) {
            try {
                emitter.complete();
            } catch (Exception e) {
                log.debug("Error completing emitter during cleanup for session {}: {}", sessionId, e.getMessage());
            }
        }

        // Keep session status for a while in case client wants to check it
        // Could implement cleanup after a certain time if needed
    }

    public int getActiveSessionCount() {
        return activeEmitters.size();
    }

    public int getTotalSessionCount() {
        return sessionStatus.size();
    }

    public void cleanupOldSessions(long maxAgeMs) {
        long cutoffTime = Instant.now().toEpochMilli() - maxAgeMs;

        sessionStatus.entrySet().removeIf(entry -> {
            SSEProgressData data = entry.getValue();
            boolean shouldRemove = data.getTimestamp() < cutoffTime;
            if (shouldRemove) {
                log.debug("Removing old session: {}", entry.getKey());
            }
            return shouldRemove;
        });
    }

    public List<ProgressData> getSessionsBySeriesId(Long seriesId) {
        progressDataRepository.findBySeriesId(seriesId).forEach(progressData -> {
            if (progressData.getState() == ProgressData.State.PROCESSING) { // Only check processing sessions

                try {
                    JsonNode node = webClient.get()
                            .uri(uriBuilder -> uriBuilder
                                    .path("/image-matcher/status")
                                    .queryParam("sessionId", progressData.getSessionId())
                                    .build())
                            .retrieve()
                            .onStatus(status -> status.value() == 404, clientResponse -> {
                                // Session not found in Python service - this is expected for orphaned sessions
                                return Mono.error(new SessionNotFoundException("Session not found in processing service"));
                            })
                            .onStatus(HttpStatusCode::is5xxServerError, clientResponse -> clientResponse.bodyToMono(String.class)
                                    .flatMap(errorBody -> Mono.error(
                                            new RuntimeException("Server error: " + clientResponse.statusCode() + " - " + errorBody))))
                            .bodyToMono(JsonNode.class)
                            .block();
                } catch (SessionNotFoundException e) {
                    // Session doesn't exist in Python service anymore
                    log.info("Session {} not found in processing service, marking as ERROR",
                            progressData.getSessionId());
                    progressData.setState(ProgressData.State.ERROR);
                    progressDataRepository.save(progressData);

                } catch (Exception e) {
                    // Other errors (network, server error, etc.)
                    log.error("Failed to check status for session {}: {}",
                            progressData.getSessionId(), e.getMessage());
                }
            }
        });

        return progressDataRepository.findBySeriesId(seriesId);
    }

    public static class SessionNotFoundException extends RuntimeException {
        public SessionNotFoundException(String message) {
            super(message);
        }
    }

    public JsonNode getSessionJSON(String sessionId) {
        return webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/json")
                        .queryParam("sessionId", sessionId)
                        .build())
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, clientResponse -> {
                    return clientResponse.bodyToMono(String.class)
                            .flatMap(errorBody -> Mono.error(
                                    new RuntimeException("Client error: " + clientResponse.statusCode() + " - " + errorBody)));
                })
                .onStatus(HttpStatusCode::is5xxServerError, clientResponse -> {
                    return clientResponse.bodyToMono(String.class)
                            .flatMap(errorBody -> Mono.error(
                                    new RuntimeException("Server error: " + clientResponse.statusCode() + " - " + errorBody)));
                })
                .bodyToMono(JsonNode.class)
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
                .block();
    }

    @Data
    @Builder
    public static class SSEProgressData {
        private String type; // "progress", "complete", "error"
        private String sessionId;
        private String stage;
        private Integer progress;
        private String message;
        private JsonNode result;
        private String error;
        private long timestamp;
    }
}