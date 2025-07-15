package com.infernokun.infernoComics.controllers;
import com.fasterxml.jackson.databind.JsonNode;
import com.infernokun.infernoComics.services.ImageProcessingProgressService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/progress")
public class ProgressController {

    private final ImageProcessingProgressService progressService;

    /**
     * Health check endpoint for Python to verify Java service availability
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> healthCheck() {
        return ResponseEntity.ok(Map.of(
                "status", "healthy",
                "service", "progress-service",
                "timestamp", String.valueOf(System.currentTimeMillis())
        ));
    }

    /**
     * Receive progress updates from Python
     */
    @PostMapping("/update")
    public ResponseEntity<Map<String, String>> receiveProgressUpdate(@RequestBody ProgressUpdateRequest request) {
        try {
            log.debug("📊 Received progress update from Python: session={}, stage={}, progress={}%, message='{}'",
                    request.getSessionId(), request.getStage(), request.getProgress(), request.getMessage());

            progressService.updateProgress(
                    request.getSessionId(),
                    request.getStage(),
                    request.getProgress(),
                    request.getMessage()
            );

            return ResponseEntity.ok(Map.of("status", "success"));

        } catch (Exception e) {
            log.error("❌ Error processing progress update from Python: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Receive completion notification from Python
     */
    @PostMapping("/complete")
    public ResponseEntity<Map<String, String>> receiveCompletion(@RequestBody CompletionRequest request) {
        try {
            log.info("✅ Received completion from Python for session: {}", request.getSessionId());

            progressService.sendComplete(request.getSessionId(), request.getResult());

            return ResponseEntity.ok(Map.of("status", "completed"));

        } catch (Exception e) {
            log.error("❌ Error processing completion from Python: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Receive error notification from Python
     */
    @PostMapping("/error")
    public ResponseEntity<Map<String, String>> receiveError(@RequestBody ErrorRequest request) {
        try {
            log.error("❌ Received error from Python for session {}: {}", request.getSessionId(), request.getError());

            progressService.sendError(request.getSessionId(), request.getError());

            return ResponseEntity.ok(Map.of("status", "error_sent"));

        } catch (Exception e) {
            log.error("❌ Error processing error notification from Python: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Get current status of a session (for debugging)
     */
    @GetMapping("/status/{sessionId}")
    public ResponseEntity<Map<String, Object>> getSessionStatus(@PathVariable String sessionId) {
        try {
            log.debug("📊 Status requested for session: {}", sessionId);

            Map<String, Object> status = progressService.getSessionStatus(sessionId);
            return ResponseEntity.ok(status);

        } catch (Exception e) {
            log.error("❌ Error getting session status: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @Data
    public static class ProgressUpdateRequest {
        private String sessionId;
        private String stage;
        private int progress;
        private String message;
    }

    @Data
    public static class CompletionRequest {
        private String sessionId;
        private JsonNode result;
    }

    @Data
    public static class ErrorRequest {
        private String sessionId;
        private String error;  // Fixed: was error() method, now it's a field
    }
}