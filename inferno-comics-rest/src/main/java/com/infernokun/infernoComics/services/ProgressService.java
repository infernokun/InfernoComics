package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.controllers.SeriesController;
import com.infernokun.infernoComics.models.ProgressData;
import com.infernokun.infernoComics.models.ProgressUpdateRequest;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.StartedBy;
import com.infernokun.infernoComics.repositories.ProgressDataRepository;
import com.infernokun.infernoComics.services.sync.WeirdService;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.Resource;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.publisher.Mono;

import javax.annotation.PreDestroy;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ProgressService {

    private final WeirdService weirdService;
    private final ProgressDataRepository progressDataRepository;
    private final Map<String, SseEmitter> activeEmitters = new ConcurrentHashMap<>();
    private final Map<String, SSEProgressData> sessionStatus = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    private final WebClient webClient;
    private final RedisTemplate<String, Object> redisTemplate;

    private static final long SSE_TIMEOUT = Duration.ofMinutes(90).toMillis();
    private static final Duration PROGRESS_TTL = Duration.ofHours(2);

    public ProgressService(WeirdService weirdService, ProgressDataRepository progressDataRepository, InfernoComicsConfig infernoComicsConfig, RedisTemplate<String, Object> redisTemplate) {
        this.weirdService = weirdService;
        this.progressDataRepository = progressDataRepository;
        this.webClient = WebClient.builder()
                .baseUrl("http://" + infernoComicsConfig.getRecognitionServerHost() + ":" + infernoComicsConfig.getRecognitionServerPort() + "/inferno-comics-recognition/api/v1")
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(500 * 1024 * 1024))
                        .build())
                .build();
        this.redisTemplate = redisTemplate;
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
            Thread.currentThread().interrupt();
        }
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
            log.error("SSE emitter error for session {}: {}", sessionId, throwable.getMessage());
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

    public void initializeSession(String sessionId, Series series, StartedBy startedBy) {
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
        progressData.setSeries(series);
        progressData.setStartedBy(startedBy);

        weirdService.saveProgressData(progressData);
    }

    public void updateProgress(ProgressUpdateRequest request) {
        log.debug("Updating progress for session {}: stage={}, progress={}%, message={}",
                request.getSessionId(), request.getStage(), request.getProgress(), request.getMessage());

        // Create SSE progress data - FIXED: using request.getStage() instead of request.getSessionId()
        SSEProgressData progressData = SSEProgressData.builder()
                .type("progress")
                .sessionId(request.getSessionId())
                .stage(request.getStage())
                .progress(request.getProgress())
                .message(request.getMessage())
                .timestamp(Instant.now().toEpochMilli())
                .data(request)
                .build();

        sessionStatus.put(request.getSessionId(), progressData);
        sendToEmitter(request.getSessionId(), progressData);
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

        try {
            Optional<ProgressData> progressDataOptional = progressDataRepository.findBySessionId(sessionId);

            if (progressDataOptional.isPresent()) {
                ProgressData progressData = progressDataOptional.get();
                progressData.setTimeFinished(LocalDateTime.now());
                progressData.setState(ProgressData.State.COMPLETE);

                // Extract and save the enhanced fields from the result
                if (result != null) {
                    if (result.has("percentageComplete")) {
                        progressData.setPercentageComplete(result.get("percentageComplete").asInt());
                    }
                    if (result.has("currentStage")) {
                        progressData.setCurrentStage(result.get("currentStage").asText());
                    }
                    if (result.has("statusMessage")) {
                        progressData.setStatusMessage(result.get("statusMessage").asText());
                    }
                    if (result.has("totalItems")) {
                        progressData.setTotalItems(result.get("totalItems").asInt());
                    }
                    if (result.has("processedItems")) {
                        progressData.setProcessedItems(result.get("processedItems").asInt());
                    }
                    if (result.has("successfulItems")) {
                        progressData.setSuccessfulItems(result.get("successfulItems").asInt());
                    }
                    if (result.has("failedItems")) {
                        progressData.setFailedItems(result.get("failedItems").asInt());
                    }
                }

                weirdService.saveProgressData(progressData);
                log.info("✅ Database updated with completion data for session: {}", sessionId);
            }
        } catch (Exception e) {
            log.error("Failed to update database with completion for session {}: {}", sessionId, e.getMessage());
        }

        SSEProgressData completeData = SSEProgressData.builder()
                .type("complete")
                .sessionId(sessionId)
                .stage("complete")
                .progress(100)
                .message("Image processing completed successfully")
                .result(result)
                .timestamp(Instant.now().toEpochMilli())
                .data(result)
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

        try {
            Optional<ProgressData> progressDataOptional = progressDataRepository.findBySessionId(sessionId);
            if (progressDataOptional.isPresent()) {
                ProgressData progressData = progressDataOptional.get();
                progressData.setState(ProgressData.State.ERROR);
                progressData.setErrorMessage(errorMessage);
                progressData.setTimeFinished(LocalDateTime.now());

                weirdService.saveProgressData(progressData);
                log.info("✅ Database updated with error state for session: {}", sessionId);
            }
        } catch (Exception e) {
            log.error("Failed to update database with error for session {}: {}", sessionId, e.getMessage());
        }

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
        SSEProgressData redisStatus = getLatestProgressFromRedis(sessionId);

        if (redisStatus != null) {
            log.debug("📊 Retrieved status from Redis for session: {}", sessionId);
            return Map.of(
                    "sessionId", sessionId,
                    "type", redisStatus.getType(),
                    "stage", redisStatus.getStage() != null ? redisStatus.getStage() : "",
                    "progress", redisStatus.getProgress() != null ? redisStatus.getProgress() : 0,
                    "message", redisStatus.getMessage() != null ? redisStatus.getMessage() : "",
                    "timestamp", redisStatus.getTimestamp(),
                    "hasEmitter", activeEmitters.containsKey(sessionId),
                    "source", "redis"
            );
        }

        // ✅ FALLBACK to in-memory sessionStatus
        SSEProgressData status = sessionStatus.get(sessionId);
        if (status != null) {
            log.debug("📊 Retrieved status from memory for session: {}", sessionId);
            return Map.of(
                    "sessionId", sessionId,
                    "type", status.getType(),
                    "stage", status.getStage() != null ? status.getStage() : "",
                    "progress", status.getProgress() != null ? status.getProgress() : 0,
                    "message", status.getMessage() != null ? status.getMessage() : "",
                    "timestamp", status.getTimestamp(),
                    "hasEmitter", activeEmitters.containsKey(sessionId),
                    "source", "memory"
            );
        }

        // ✅ FINAL FALLBACK to database for completed/error sessions
        try {
            Optional<ProgressData> dbData = progressDataRepository.findBySessionId(sessionId);
            if (dbData.isPresent()) {
                ProgressData progressData = dbData.get();
                log.debug("📊 Retrieved status from database for session: {}", sessionId);
                return Map.of(
                        "sessionId", sessionId,
                        "type", progressData.getState().toString().toLowerCase(),
                        "stage", progressData.getCurrentStage() != null ? progressData.getCurrentStage() : "",
                        "progress", progressData.getPercentageComplete() != null ? progressData.getPercentageComplete() : 0,
                        "message", progressData.getStatusMessage() != null ? progressData.getStatusMessage() : "",
                        "timestamp", progressData.getLastUpdated() != null ?
                                progressData.getLastUpdated().atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli() : 0,
                        "hasEmitter", activeEmitters.containsKey(sessionId),
                        "source", "database"
                );
            }
        } catch (Exception e) {
            log.warn("Failed to retrieve status from database for session {}: {}", sessionId, e.getMessage());
        }

        return Map.of(
                "sessionId", sessionId,
                "status", "not_found",
                "message", "Session not found",
                "source", "none"
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
                log.warn("Failed to send SSE event to session {}: {}", sessionId, e.getMessage());
                cleanupSession(sessionId);
            }
        }

        storeProgressInRedis(sessionId, data);
    }

    private void storeProgressInRedis(String sessionId, SSEProgressData data) {
        try {
            String redisKey = "sse:progress:" + sessionId;

            // Store as JSON string
            String jsonData = objectMapper.writeValueAsString(data);
            redisTemplate.opsForValue().set(redisKey, jsonData, PROGRESS_TTL);

            log.info("Progress data stored in Redis for session: {}", sessionId);

            // Also maintain a list of recent progress updates
            String listKey = "sse:progress:list:" + sessionId;
            redisTemplate.opsForList().leftPush(listKey, jsonData);
            redisTemplate.opsForList().trim(listKey, 0, 99);
            redisTemplate.expire(listKey, PROGRESS_TTL);

        } catch (Exception e) {
            log.error("Failed to store progress data in Redis for session {}: {}", sessionId, e.getMessage(), e);
        }
    }

    public SSEProgressData getLatestProgressFromRedis(String sessionId) {
        try {
            String redisKey = "sse:progress:" + sessionId;
            String jsonData = (String) redisTemplate.opsForValue().get(redisKey);

            if (jsonData != null) {
                SSEProgressData progressData = objectMapper.readValue(jsonData, SSEProgressData.class);

                // Check if the progress data is recent (e.g., within last 5 minutes)
                if (isProgressDataRecent(progressData)) {
                    return progressData;
                } else {
                    log.debug("Progress data for session {} is stale", sessionId);
                    return null;
                }
            }
        } catch (Exception e) {
            log.error("Failed to retrieve progress data from Redis for session {}: {}", sessionId, e.getMessage());
        }
        return null;
    }

    private boolean isProgressDataRecent(SSEProgressData progressData) {
        // Check if progress data has a timestamp and is recent
        if (progressData.getTimestamp() != 0) {
            long ageMinutes = (System.currentTimeMillis() - progressData.getTimestamp()) / (1000 * 60);
            return ageMinutes <= 5; // Consider data stale after 5 minutes
        }
        return false; // No timestamp, assume stale
    }

    public List<SSEProgressData> getProgressHistoryFromRedis(String sessionId) {
        try {
            String listKey = "sse:progress:list:" + sessionId;
            List<Object> progressList = redisTemplate.opsForList().range(listKey, 0, -1);

            if (progressList != null) {
                return progressList.stream()
                        .map(obj -> {
                            try {
                                return objectMapper.readValue((String) obj, SSEProgressData.class);
                            } catch (Exception e) {
                                log.warn("Failed to parse progress data: {}", e.getMessage());
                                return null;
                            }
                        })
                        .filter(Objects::nonNull)
                        .collect(Collectors.toList());
            }
        } catch (Exception e) {
            log.error("Failed to retrieve progress history from Redis for session {}: {}", sessionId, e.getMessage(), e);
        }
        return Collections.emptyList();
    }

    private void updateInMemoryProgressFromRedis(ProgressData progressData, SSEProgressData latestProgress) {
        try {
            // Update progress percentage
            if (latestProgress.getProgress() != null) {
                progressData.setPercentageComplete(latestProgress.getProgress());
            }

            // Update current stage
            if (latestProgress.getStage() != null) {
                progressData.setCurrentStage(latestProgress.getStage());
            }

            // Update status message
            if (latestProgress.getMessage() != null) {
                progressData.setStatusMessage(latestProgress.getMessage());
            }

            // Parse additional data from Redis if available
            if (latestProgress.getData() != null) {
                updateProgressFromAdditionalDataInMemory(progressData, latestProgress.getData());
            }

            // Update last updated timestamp
            progressData.setLastUpdated(LocalDateTime.ofInstant(
                    Instant.ofEpochMilli(latestProgress.getTimestamp()),
                    java.time.ZoneId.systemDefault()));

            log.debug("Updated in-memory progress data from Redis for session {}", progressData.getSessionId());

        } catch (Exception e) {
            log.error("Failed to update in-memory progress data from Redis for session {}: {}",
                    progressData.getSessionId(), e.getMessage());
        }
    }

    // ✅ NEW METHOD: Update additional data in memory only
    private void updateProgressFromAdditionalDataInMemory(ProgressData progressData, Object additionalData) {
        try {
            if (additionalData instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> dataMap = (Map<String, Object>) additionalData;

                // Update total items
                if (dataMap.containsKey("totalItems")) {
                    Integer totalItems = getIntegerFromMap(dataMap, "totalItems");
                    if (totalItems != null) {
                        progressData.setTotalItems(totalItems);
                    }
                }

                // Update processed items
                if (dataMap.containsKey("processedItems")) {
                    Integer processedItems = getIntegerFromMap(dataMap, "processedItems");
                    if (processedItems != null) {
                        progressData.setProcessedItems(processedItems);
                    }
                }

                // Update successful items
                if (dataMap.containsKey("successfulItems")) {
                    Integer successfulItems = getIntegerFromMap(dataMap, "successfulItems");
                    if (successfulItems != null) {
                        progressData.setSuccessfulItems(successfulItems);
                    }
                }

                // Update failed items
                if (dataMap.containsKey("failedItems")) {
                    Integer failedItems = getIntegerFromMap(dataMap, "failedItems");
                    if (failedItems != null) {
                        progressData.setFailedItems(failedItems);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse additional progress data in memory: {}", e.getMessage());
        }
    }

    public List<ProgressData> getSessionsBySeriesId(Long seriesId) {
        List<ProgressData> sessions = progressDataRepository.findBySeriesId(seriesId);

        getLatestDataFromRedis(sessions);

        return sessions;
    }

    public void getLatestDataFromRedis(List<ProgressData> sessions) {
        sessions.forEach(progressData -> {
            if (progressData.getState() == ProgressData.State.PROCESSING) {
                try {
                    // Check if session has recent progress data in Redis
                    SSEProgressData latestProgress = getLatestProgressFromRedis(progressData.getSessionId());

                    if (latestProgress != null) {
                        // Session exists and has recent activity - update in-memory copy (NOT database)
                        log.debug("Session {} found in Redis with latest progress: {} - {}%",
                                progressData.getSessionId(), latestProgress.getStage(), latestProgress.getProgress());

                        // FIXED: Added the missing method call
                        updateInMemoryProgressFromRedis(progressData, latestProgress);

                    } else if (progressData.isStale()) {
                        log.debug("Session {} appears stale but leaving as PROCESSING - will be updated on next complete/error event",
                                progressData.getSessionId());
                    }

                } catch (Exception e) {
                    log.error("Failed to check Redis status for session {}: {}",
                            progressData.getSessionId(), e.getMessage());
                }
            }
        });
    }

    public List<ProgressData> getSessionsByRelevance() {
        List<ProgressData> sessions = progressDataRepository.findByStartedOrFinishedWithinLast24Hours(LocalDateTime.now().minusDays(7));
        getLatestDataFromRedis(sessions);

        sessions = sessions.stream().filter(s -> !s.dismissed).toList();

        return sessions;
    }

    public List<ProgressData> dismissProgressData(long id) {
        Optional<ProgressData> progressDataOpt = progressDataRepository.findById(id);

        if (progressDataOpt.isEmpty())  return null;

        ProgressData progressData = progressDataOpt.get();

        progressData.setDismissed(true);
        weirdService.saveProgressData(progressData);

        return getSessionsByRelevance();
    }

    private Integer getIntegerFromMap(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object value = map.get(key);
            if (value instanceof Number) {
                return ((Number) value).intValue();
            } else if (value instanceof String) {
                try {
                    return Integer.parseInt((String) value);
                } catch (NumberFormatException e) {
                    // Continue to next key
                }
            }
        }
        return null;
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

    // FIXED: Using ScheduledExecutorService instead of creating new threads
    private void scheduleEmitterCompletion(String sessionId, long delayMs) {
        scheduler.schedule(() -> {
            SseEmitter emitter = activeEmitters.get(sessionId);
            if (emitter != null) {
                try {
                    emitter.complete();
                } catch (Exception e) {
                    log.error("Error completing emitter for session {}: {}", sessionId, e.getMessage());
                }
            }
        }, delayMs, TimeUnit.MILLISECONDS);
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
                .onStatus(HttpStatusCode::is4xxClientError, clientResponse ->
                        Mono.error(new RuntimeException("Image not found: " + fileName)))
                .onStatus(HttpStatusCode::is5xxServerError, serverResponse ->
                        Mono.error(new RuntimeException("Server error fetching image: " + fileName)))
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(30))
                .block();
    }

    public static class SessionNotFoundException extends RuntimeException {
        public SessionNotFoundException(String message) {
            super(message);
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SSEProgressData {
        private String type; // "progress", "complete", "error"
        private String sessionId;
        private String stage;
        private Integer progress;
        private String message;
        private JsonNode result;
        private String error;
        private long timestamp;
        private Object data; // Additional progress data
    }
}