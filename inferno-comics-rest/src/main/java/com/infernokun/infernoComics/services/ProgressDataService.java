package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infernokun.infernoComics.models.ProgressData;
import com.infernokun.infernoComics.models.ProgressUpdateRequest;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.enums.StartedBy;
import com.infernokun.infernoComics.models.enums.State;
import com.infernokun.infernoComics.repositories.ProgressDataRepository;
import com.infernokun.infernoComics.services.sync.WeirdService;
import com.infernokun.infernoComics.clients.SocketClient;
import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

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

import static java.util.stream.Collectors.toList;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProgressDataService {
    private final WeirdService weirdService;
    private final SocketClient websocket;
    private final ProgressDataRepository progressDataRepository;
    private final Map<String, SseEmitter> activeEmitters = new ConcurrentHashMap<>();
    private final Map<String, SSEProgressData> sessionStatus = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);
    private final RedisTemplate<String, Object> redisTemplate;
    private final RedisJsonService redisJsonService;

    private static final long SSE_TIMEOUT = Duration.ofMinutes(90).toMillis();
    private static final Duration PROGRESS_TTL = Duration.ofHours(2);

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
                .type(State.PROCESSING.name())
                .sessionId(sessionId)
                .stage("preparing")
                .progress(0)
                .message("Session initialized, waiting for processing...")
                .timestamp(Instant.now().toEpochMilli())
                .build();

        sessionStatus.put(sessionId, initialStatus);
        log.info("Session {} initialized and stored in sessionStatus", sessionId);

        ProgressData progressData = new ProgressData();
        progressData.setState(State.PROCESSING);
        progressData.setSessionId(sessionId);
        progressData.setTimeStarted(LocalDateTime.now());
        progressData.setSeries(series);
        progressData.setStartedBy(startedBy);

        weirdService.saveProgressData(progressData);

        sendToWebSocket();
    }

    public void updateProgress(ProgressUpdateRequest request) {
        log.debug("Updating progress for session {}: stage={}, progress={}%, message={}",
                request.getSessionId(), request.getStage(), request.getProgress(), request.getMessage());

        SSEProgressData progressData = SSEProgressData.builder()
                .type(State.PROCESSING.name())
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
                progressData.setState(State.COMPLETED);

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
                sendToWebSocket();
                log.info("Database updated with completion data for session: {}", sessionId);
            }
        } catch (Exception e) {
            log.error("Failed to update database with completion for session {}: {}", sessionId, e.getMessage());
        }

        SSEProgressData completeData = SSEProgressData.builder()
                .type(State.COMPLETED.name())
                .sessionId(sessionId)
                .stage(State.COMPLETED.name())
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
            log.warn("Attempting to find ProgressData for session: {}", sessionId);
            Optional<ProgressData> progressDataOptional = progressDataRepository.findBySessionId(sessionId);
            log.warn("ProgressData found for session {}: {}", sessionId, progressDataOptional.isPresent());

            if (progressDataOptional.isPresent()) {
                ProgressData progressData = progressDataOptional.get();
                log.warn("Updating ProgressData for session: {}", sessionId);
                progressData.setState(State.ERROR);
                progressData.setErrorMessage(errorMessage);
                progressData.setTimeFinished(LocalDateTime.now());

                log.warn("About to save ProgressData for session: {}", sessionId);
                weirdService.saveProgressData(progressData);
                log.warn("ProgressData saved successfully for session: {}", sessionId);

                sendToWebSocket();
                log.info("✅ Database updated with error state for session: {}", sessionId);
            } else {
                log.warn("No ProgressData found for session ID: {}", sessionId);
            }
        } catch (Exception e) {
            log.warn("Failed to update database with error for session {}: {}", sessionId, e.getMessage());
        }

        SSEProgressData errorData = SSEProgressData.builder()
                .type(State.ERROR.name())
                .sessionId(sessionId)
                .error(errorMessage)
                .timestamp(Instant.now().toEpochMilli())
                .build();

        log.warn("Setting errorData in sessionStatus for session: {}", sessionId);
        sessionStatus.put(sessionId, errorData);

        log.warn("Calling sendToEmitter for session: {}", sessionId);
        sendToEmitter(sessionId, errorData);

        log.warn("Scheduling emitter completion for session: {} in 2000ms", sessionId);
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
                        "type", progressData.getState().name(),
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
            } catch (IOException e) {
                log.warn("Emitter disconnected from SSE event to session {}...:", sessionId);
                cleanupSession(sessionId);
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

            // Store as Redis JSON datatype
            redisJsonService.jsonSet(redisKey, data, PROGRESS_TTL);

            log.debug("Progress data stored in Redis for session: {}", sessionId);

            // Also maintain a list of recent progress updates (Redis List, not JSON)
            String listKey = "sse:progress:list:" + sessionId;
            String jsonData = objectMapper.writeValueAsString(data);
            redisTemplate.opsForList().leftPush(listKey, jsonData);
            redisTemplate.opsForList().trim(listKey, 0, 99);
            redisTemplate.expire(listKey, PROGRESS_TTL);

            Long seriesId = getSeriesIdBySessionId(sessionId);
            if (seriesId != -1) {
                List<ProgressData> progressDataList = getSessionsBySeriesId(seriesId);
                websocket.broadcastObjUpdate(progressDataList, ProgressData.class.getSimpleName() + "ListTable", seriesId);
            }

        } catch (Exception e) {
            log.error("Failed to store progress data in Redis for session {}: {}", sessionId, e.getMessage(), e);
        }
    }

    public Long getSeriesIdBySessionId(String sessionId) {
        Optional<ProgressData> dataOptional =  progressDataRepository.findBySessionId(sessionId);
        return dataOptional.isPresent() ? dataOptional.get().getSeries().getId() : -1;
    }

    public SSEProgressData getLatestProgressFromRedis(String sessionId) {
        try {
            String redisKey = "sse:progress:" + sessionId;
            SSEProgressData progressData = redisJsonService.jsonGet(redisKey, SSEProgressData.class);

            if (progressData != null) {
                // Check if the progress data is recent (e.g., within last 5 minutes)
                if (isProgressDataRecent(progressData)) {
                    return progressData;
                } else {
                    log.debug("Progress data for session {} is stale", sessionId);
                    return null;
                }
            }
        } catch (Exception e) {
            log.error("Failed to retrieve progress data from Redis for session {}: {}", sessionId, e.getMessage(), e);
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
                        .collect(toList());
            }
        } catch (Exception e) {
            log.error("Failed to retrieve progress history from Redis for session {}: {}", sessionId, e.getMessage(), e);
        }
        return Collections.emptyList();
    }

    private void updateInMemoryProgressFromRedis(ProgressData progressData, SSEProgressData latestProgress) {
        try {
            Objects.requireNonNull(progressData, "progressData must not be null");
            Objects.requireNonNull(latestProgress, "latestProgress must not be null");

            updatePercentageComplete(progressData, latestProgress);
            progressData.setCurrentStage(latestProgress.getStage());
            progressData.setStatusMessage(latestProgress.getMessage());
            updateProgressFromAdditionalDataInMemory(progressData, latestProgress.getData());
            progressData.setLastUpdated(LocalDateTime.ofInstant(
                    Instant.ofEpochMilli(latestProgress.getTimestamp()),
                    java.time.ZoneId.systemDefault()));

            log.debug("Updated in-memory progress data from Redis for session {}", progressData.getSessionId());

        } catch (Exception e) {
            log.error("Failed to update in-memory progress data from Redis for session {}: {}",
                    progressData.getSessionId(), e.getMessage());
        }
    }

    private void updatePercentageComplete(ProgressData progressData,
                                          SSEProgressData latestProgress) {
        Objects.requireNonNull(progressData, "progressData must not be null");
        Objects.requireNonNull(latestProgress, "latestProgress must not be null");

        Integer current = progressData.getPercentageComplete();
        Integer incoming = latestProgress.getProgress();

        if (current == null) {
            progressData.setPercentageComplete(incoming != null ? incoming : 0);
            log.debug("Session {}: percentageComplete initialised to {}",
                    progressData.getSessionId(),
                    progressData.getPercentageComplete());
            return;
        }

        if (incoming != null && incoming > current) {
            progressData.setPercentageComplete(incoming);
            log.debug("Session {}: percentageComplete advanced from {} to {}",
                    progressData.getSessionId(), current, incoming);
        } else {
            // No change needed – either incoming is null or not greater
            log.debug("Session {}: percentageComplete unchanged (current={})",
                    progressData.getSessionId(), current);
        }
    }

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
            if (progressData.getState() == State.PROCESSING) {
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

    public List<ProgressData> getRecentSessions() {
        List<ProgressData> sessions = progressDataRepository.findWithinLast14Days(LocalDateTime.now().minusDays(14));
        getLatestDataFromRedis(sessions);

        return sessions.stream()
                .filter(s -> !s.dismissed)
                .toList();
    }

    public void sendToWebSocket() {
        List<ProgressData> progressDataList = getRecentSessions();
        Long id = progressDataList.getLast().getSeries().getId();
        websocket.broadcastObjUpdate(progressDataList, ProgressData.class.getSimpleName() + "ListRelevance", id);
    }

    public List<ProgressData> dismissProgressData(long id) {
        Optional<ProgressData> progressDataOpt = progressDataRepository.findById(id);

        if (progressDataOpt.isEmpty())  return null;

        ProgressData progressData = progressDataOpt.get();

        progressData.setDismissed(true);
        weirdService.saveProgressData(progressData);
        sendToWebSocket();

        return getRecentSessions();
    }

    public Optional<ProgressData> getProgressDataBySessionId(String sessionId) {
        return progressDataRepository.findBySessionId(sessionId);
    }

    @Transactional
    public void deleteProgressDataBySessionId(String sessionId) {
        progressDataRepository.deleteBySessionId(sessionId);
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

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SSEProgressData {
        private String type; // "PROCESSING", "COMPLETED", "ERROR"
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