package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.ProgressData;
import com.infernokun.infernoComics.repositories.ProgressDataRepository;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ProgressService {

    private final Map<String, SseEmitter> activeEmitters = new ConcurrentHashMap<>();
    private final Map<String, SSEProgressData> sessionStatus = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final ProgressDataRepository progressDataRepository;
    private final WebClient webClient;
    private final RedisTemplate<String, Object> redisTemplate;

    // SSE timeout: 90 minutes (should be enough for image processing)
    private static final long SSE_TIMEOUT = Duration.ofMinutes(90).toMillis();
    private static final Duration PROGRESS_TTL = Duration.ofHours(2);

    public ProgressService(ProgressDataRepository progressDataRepository, InfernoComicsConfig infernoComicsConfig, RedisTemplate<String, Object> redisTemplate) {
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

        // Update database record with enhanced information extracted from message
        Optional<ProgressData> progressDataOptional = progressDataRepository.findBySessionId(sessionId);
        if (progressDataOptional.isPresent()) {
            ProgressData progressData = progressDataOptional.get();
            boolean hasChanges = false;

            // Update basic progress fields
            if (!Objects.equals(progressData.getPercentageComplete(), progress)) {
                progressData.setPercentageComplete(progress);
                hasChanges = true;
            }

            if (stage != null && !Objects.equals(progressData.getCurrentStage(), stage)) {
                progressData.setCurrentStage(stage);
                hasChanges = true;
            }

            if (message != null && !Objects.equals(progressData.getStatusMessage(), message)) {
                progressData.setStatusMessage(message.length() > 1000 ? message.substring(0, 1000) : message);
                hasChanges = true;
            }

            // Extract enhanced information from the message
            extractAndUpdateEnhancedFields(progressData, message, stage);
            hasChanges = true; // Assume changes for simplicity since extraction might update fields

            // Only save if there were actual changes
            if (hasChanges) {
                progressData.setLastUpdated(LocalDateTime.now());
                progressDataRepository.save(progressData);
                log.debug("Updated progress data for session {} with enhanced fields extracted from message", sessionId);
            }
        }

        // Create SSE progress data
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

    // New overloaded method to handle the enhanced data from Python
    public void updateProgressWithEnhancedData(String sessionId, String stage, int progress, String message,
                                               String processType, Integer totalItems, Integer processedItems,
                                               Integer successfulItems, Integer failedItems) {
        log.debug("Updating enhanced progress for session {}: stage={}, progress={}%, message={}",
                sessionId, stage, progress, message);

        // Update database record with enhanced information
        Optional<ProgressData> progressDataOptional = progressDataRepository.findBySessionId(sessionId);
        if (progressDataOptional.isPresent()) {
            ProgressData progressData = progressDataOptional.get();
            boolean hasChanges = false;

            // Update basic progress fields
            if (!Objects.equals(progressData.getPercentageComplete(), progress)) {
                progressData.setPercentageComplete(progress);
                hasChanges = true;
            }

            if (stage != null && !Objects.equals(progressData.getCurrentStage(), stage)) {
                progressData.setCurrentStage(stage);
                hasChanges = true;
            }

            if (message != null && !Objects.equals(progressData.getStatusMessage(), message)) {
                progressData.setStatusMessage(message.length() > 1000 ? message.substring(0, 1000) : message);
                hasChanges = true;
            }

            // Update enhanced fields directly
            if (processType != null && !Objects.equals(progressData.getProcessType(), processType)) {
                progressData.setProcessType(processType);
                hasChanges = true;
            }

            if (totalItems != null && !Objects.equals(progressData.getTotalItems(), totalItems)) {
                progressData.setTotalItems(totalItems);
                hasChanges = true;
            }

            if (processedItems != null && !Objects.equals(progressData.getProcessedItems(), processedItems)) {
                progressData.setProcessedItems(processedItems);
                hasChanges = true;
            }

            if (successfulItems != null && !Objects.equals(progressData.getSuccessfulItems(), successfulItems)) {
                progressData.setSuccessfulItems(successfulItems);
                hasChanges = true;
            }

            if (failedItems != null && !Objects.equals(progressData.getFailedItems(), failedItems)) {
                progressData.setFailedItems(failedItems);
                hasChanges = true;
            }

            // Only save if there were actual changes
            if (hasChanges) {
                progressData.setLastUpdated(LocalDateTime.now());
                progressDataRepository.save(progressData);
                log.debug("Updated progress data from Python for session {} with enhanced fields", sessionId);
            }
        }

        // Create SSE progress data with enhanced information
        Map<String, Object> enhancedData = new HashMap<>();
        if (processType != null) enhancedData.put("processType", processType);
        if (totalItems != null) enhancedData.put("totalItems", totalItems);
        if (processedItems != null) enhancedData.put("processedItems", processedItems);
        if (successfulItems != null) enhancedData.put("successfulItems", successfulItems);
        if (failedItems != null) enhancedData.put("failedItems", failedItems);

        SSEProgressData progressData = SSEProgressData.builder()
                .type("progress")
                .sessionId(sessionId)
                .stage(stage)
                .progress(progress)
                .message(message)
                .data(enhancedData.isEmpty() ? null : enhancedData)
                .timestamp(Instant.now().toEpochMilli())
                .build();

        sessionStatus.put(sessionId, progressData);
        sendToEmitter(sessionId, progressData);
    }

    // Helper method to extract enhanced information from message text
    private void extractAndUpdateEnhancedFields(ProgressData progressData, String message, String stage) {
        if (message == null) return;

        try {
            // Detect process type from message patterns
            if (progressData.getProcessType() == null) {
                if (message.toLowerCase().contains("multiple images") ||
                        (message.contains("Image ") && message.contains("/"))) {
                    progressData.setProcessType("multiple_images");
                } else if (message.toLowerCase().contains("folder")) {
                    progressData.setProcessType("folder_evaluation");
                } else {
                    progressData.setProcessType("single_image");
                }
            }

            // Extract total items from messages like "Processing 5 uploaded images" or "Image 2/10"
            if (progressData.getTotalItems() == null) {
                java.util.regex.Pattern totalPattern = java.util.regex.Pattern.compile("(\\d+)\\s+(?:uploaded\\s+)?images?|Image\\s+\\d+/(\\d+)");
                java.util.regex.Matcher totalMatcher = totalPattern.matcher(message);
                if (totalMatcher.find()) {
                    String total = totalMatcher.group(1) != null ? totalMatcher.group(1) : totalMatcher.group(2);
                    if (total != null) {
                        progressData.setTotalItems(Integer.parseInt(total));
                    }
                }
            }

            // Extract current item from messages like "Image 3/10" or "Processing candidate 45/200"
            java.util.regex.Pattern currentPattern = java.util.regex.Pattern.compile("Image\\s+(\\d+)/\\d+|candidate\\s+(\\d+)/\\d+|Processing\\s+(\\d+)");
            java.util.regex.Matcher currentMatcher = currentPattern.matcher(message);
            if (currentMatcher.find()) {
                String current = currentMatcher.group(1) != null ? currentMatcher.group(1) :
                        (currentMatcher.group(2) != null ? currentMatcher.group(2) : currentMatcher.group(3));
                if (current != null) {
                    int currentItem = Integer.parseInt(current);
                    // Only update if it's actually progressing forward
                    if (progressData.getProcessedItems() == null || currentItem > progressData.getProcessedItems()) {
                        progressData.setProcessedItems(currentItem);
                    }
                }
            }

            // Track successful/failed items from completion messages
            if (message.toLowerCase().contains("complete") || message.toLowerCase().contains("completed")) {
                if (!message.toLowerCase().contains("error") && !message.toLowerCase().contains("failed")) {
                    // Successful completion
                    java.util.regex.Pattern successPattern = java.util.regex.Pattern.compile("Successfully processed (\\d+)/(\\d+)");
                    java.util.regex.Matcher successMatcher = successPattern.matcher(message);
                    if (successMatcher.find()) {
                        progressData.setSuccessfulItems(Integer.parseInt(successMatcher.group(1)));
                        int total = Integer.parseInt(successMatcher.group(2));
                        progressData.setFailedItems(total - progressData.getSuccessfulItems());
                    } else if (message.toLowerCase().contains("image ")) {
                        // Single image completion
                        Integer current = progressData.getSuccessfulItems();
                        progressData.setSuccessfulItems(current != null ? current + 1 : 1);
                    }
                }
            }

            if (message.toLowerCase().contains("failed") || message.toLowerCase().contains("error")) {
                if (message.toLowerCase().contains("image ")) {
                    Integer current = progressData.getFailedItems();
                    progressData.setFailedItems(current != null ? current + 1 : 1);
                }
            }

        } catch (Exception e) {
            log.warn("Failed to extract enhanced fields from message: {}", e.getMessage());
        }
    }

    // Helper method to safely convert various number types to Integer
    private Integer getIntegerFromObject(Object value) {
        if (value instanceof Number) {
            return ((Number) value).intValue();
        } else if (value instanceof String) {
            try {
                return Integer.parseInt((String) value);
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
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
                log.error("Failed to send SSE event to session {}: {}", sessionId, e.getMessage());
                cleanupSession(sessionId);
            }
        } else {
            storeProgressInRedis(sessionId, data);
        }
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
            //redisTemplate.opsForList().trim(listKey, 0, 99); // Keep last 100 updates
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

    public List<ProgressData> getSessionsBySeriesId(Long seriesId) {
        List<ProgressData> sessions = progressDataRepository.findBySeriesId(seriesId);

        sessions.forEach(progressData -> {
            if (progressData.getState() == ProgressData.State.PROCESSING) {

                try {
                    // Check if session has recent progress data in Redis
                    SSEProgressData latestProgress = getLatestProgressFromRedis(progressData.getSessionId());

                    if (latestProgress != null) {
                        // Session exists and has recent activity
                        log.debug("Session {} found in Redis with latest progress: {} - {}%",
                                progressData.getSessionId(), latestProgress.getStage(), latestProgress.getProgress());

                        // Update progress data with latest info from Redis
                        updateProgressDataFromRedis(progressData, latestProgress);

                    } else if (progressData.isStale()) {
                        // No recent progress data and session is stale - likely orphaned
                        log.info("Session {} appears to be stale/orphaned, marking as ERROR",
                                progressData.getSessionId());

                        progressData.setState(ProgressData.State.ERROR);
                        progressData.setErrorMessage("Session appears to be orphaned - no recent progress updates");
                        progressData.setTimeFinished(LocalDateTime.now());
                        progressDataRepository.save(progressData);
                    }

                } catch (Exception e) {
                    log.error("Failed to check Redis status for session {}: {}",
                            progressData.getSessionId(), e.getMessage());
                }
            }
        });

        return sessions;
    }

    private void updateProgressDataFromRedis(ProgressData progressData, SSEProgressData latestProgress) {
        try {
            boolean hasChanges = false;

            // Update progress percentage
            if (latestProgress.getProgress() != null &&
                    !Objects.equals(progressData.getPercentageComplete(), latestProgress.getProgress())) {
                progressData.setPercentageComplete(latestProgress.getProgress());
                hasChanges = true;
            }

            // Update current stage
            if (latestProgress.getStage() != null &&
                    !Objects.equals(progressData.getCurrentStage(), latestProgress.getStage())) {
                progressData.setCurrentStage(latestProgress.getStage());
                hasChanges = true;
            }

            // Update status message
            if (latestProgress.getMessage() != null &&
                    !Objects.equals(progressData.getStatusMessage(), latestProgress.getMessage())) {
                progressData.setStatusMessage(latestProgress.getMessage());
                hasChanges = true;
            }

            // Parse additional data from Redis if available
            if (latestProgress.getData() != null) {
                updateProgressFromAdditionalData(progressData, latestProgress.getData());
                hasChanges = true;
            }

            // Check if processing is complete
            if ("complete".equals(latestProgress.getType()) ||
                    (latestProgress.getProgress() != null && latestProgress.getProgress() >= 100)) {

                if (progressData.getState() != ProgressData.State.COMPLETE) {
                    progressData.setState(ProgressData.State.COMPLETE);
                    progressData.setTimeFinished(LocalDateTime.now());
                    hasChanges = true;
                }

            } else if ("error".equals(latestProgress.getType())) {
                if (progressData.getState() != ProgressData.State.ERROR) {
                    progressData.setState(ProgressData.State.ERROR);
                    progressData.setErrorMessage(latestProgress.getError() != null ? latestProgress.getError() : latestProgress.getMessage());
                    progressData.setTimeFinished(LocalDateTime.now());
                    hasChanges = true;
                }
            }

            // Only save if there were actual changes
            if (hasChanges) {
                progressData.setLastUpdated(LocalDateTime.now());
                progressDataRepository.save(progressData);
                log.debug("Updated progress data from Redis for session {}", progressData.getSessionId());
            }

        } catch (Exception e) {
            log.error("Failed to update progress data from Redis for session {}: {}",
                    progressData.getSessionId(), e.getMessage());
        }
    }

    private void updateProgressFromAdditionalData(ProgressData progressData, Object additionalData) {
        try {
            if (additionalData instanceof Map) {
                Map<String, Object> dataMap = (Map<String, Object>) additionalData;

                // Update total items
                if (dataMap.containsKey("total_images") || dataMap.containsKey("totalItems")) {
                    Integer totalItems = getIntegerFromMap(dataMap, "total_images", "totalItems");
                    if (totalItems != null && !Objects.equals(progressData.getTotalItems(), totalItems)) {
                        progressData.setTotalItems(totalItems);
                    }
                }

                // Update processed items
                if (dataMap.containsKey("processed_images") || dataMap.containsKey("processedItems")) {
                    Integer processedItems = getIntegerFromMap(dataMap, "processed_images", "processedItems");
                    if (processedItems != null && !Objects.equals(progressData.getProcessedItems(), processedItems)) {
                        progressData.setProcessedItems(processedItems);
                    }
                }

                // Update successful items
                if (dataMap.containsKey("successful_images") || dataMap.containsKey("successfulItems")) {
                    Integer successfulItems = getIntegerFromMap(dataMap, "successful_images", "successfulItems");
                    if (successfulItems != null && !Objects.equals(progressData.getSuccessfulItems(), successfulItems)) {
                        progressData.setSuccessfulItems(successfulItems);
                    }
                }

                // Update failed items
                if (dataMap.containsKey("failed_images") || dataMap.containsKey("failedItems")) {
                    Integer failedItems = getIntegerFromMap(dataMap, "failed_images", "failedItems");
                    if (failedItems != null && !Objects.equals(progressData.getFailedItems(), failedItems)) {
                        progressData.setFailedItems(failedItems);
                    }
                }

                // Update process type if not set
                if (progressData.getProcessType() == null && dataMap.containsKey("query_type")) {
                    String queryType = (String) dataMap.get("query_type");
                    progressData.setProcessType(queryType);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse additional progress data: {}", e.getMessage());
        }
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