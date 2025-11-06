package com.infernokun.infernoComics.controllers;
import com.fasterxml.jackson.databind.JsonNode;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.ProgressData;
import com.infernokun.infernoComics.models.ProgressUpdateRequest;
import com.infernokun.infernoComics.models.sync.ProcessedFile;
import com.infernokun.infernoComics.repositories.sync.ProcessedFileRepository;
import com.infernokun.infernoComics.services.ProgressService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/progress")
public class ProgressController {

    private final ProgressService progressService;
    private final InfernoComicsConfig infernoComicsConfig;
    private final ProcessedFileRepository processedFileRepository;

    // health check endpoint for Python to verify Java service availability
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> healthCheck() {
        return ResponseEntity.ok(Map.of(
                "status", "healthy",
                "service", "progress-service",
                "timestamp", String.valueOf(System.currentTimeMillis())
        ));
    }

    // receive progress updates from Python
    @PostMapping("/update")
    public ResponseEntity<Map<String, String>> receiveProgressUpdate(@RequestBody ProgressUpdateRequest request) {
        try {
            log.debug("📊 Received progress update from Python: session={}, stage={}, progress={}%, message='{}'",
                    request.getSessionId(), request.getStage(), request.getProgress(), request.getMessage());

            progressService.updateProgress(request);

            return ResponseEntity.ok(Map.of("status", "success"));

        } catch (Exception e) {
            log.error("❌ Error processing progress update from Python: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // receive completion notification from Python
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

    @PostMapping("/processed-file")
    public ResponseEntity<Map<String, String>> receiveProcessedFile(
            @RequestBody Map<String, String> processedFile) {

        String sessionId        = processedFile.get("session_id");
        String originalFileName = processedFile.get("original_file_name");
        String processedFileHash = processedFile.get("file_hash");
        String storedFileName   = processedFile.get("stored_file_name");

        // 1️⃣ Validate mandatory fields
        if (sessionId == null || originalFileName == null) {
            log.warn("Missing mandatory fields: sessionId={}, originalFileName={}",
                    sessionId, originalFileName);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of(
                            "status", "error",
                            "message", "Missing session_id or original_file_name"
                    ));
        }

        // 2️⃣ Try‑catch to surface any unexpected runtime exception
        try {
            Optional<ProcessedFile> processedFileOptional =
                    processedFileRepository.findBySessionIdAndFileName(sessionId, originalFileName);

            Map<String, String> response = new HashMap<>();
            if (processedFileOptional.isPresent()) {
                ProcessedFile processedFileEntity = processedFileOptional.get();

                // 3️⃣ Update with the processed file information
                processedFileEntity.setFileEtag(processedFileHash);
                processedFileEntity.setFileName(storedFileName);
                processedFileEntity.setProcessingStatus(ProcessedFile.ProcessingStatus.COMPLETE);
                processedFileEntity.setProcessedAt(LocalDateTime.now());

                processedFileRepository.save(processedFileEntity);

                response.put("status", "success");
                response.put("message", "Processed file info updated successfully");
                return ResponseEntity.ok(response);
            } else {
                response.put("status", "error");
                response.put("message",
                        "ProcessedFile not found for session: " + sessionId +
                                " and filename: " + originalFileName);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
            }
        } catch (Exception e) {
            // 3️⃣ Log the exception and return 500 with a friendly message
            log.error("Unexpected error while processing file", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of(
                            "status", "error",
                            "message", "Internal server error"
                    ));
        }
    }

    // receive error notification from Python
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

    // get current status of a session (for debugging)
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

    @GetMapping("/data/{seriesId}")
    public ResponseEntity<List<ProgressData>> getSessionsBySeriesId(@PathVariable Long seriesId) {
        return ResponseEntity.ok(progressService.getSessionsBySeriesId(seriesId));
    }

    @GetMapping("/data/rel")
    public ResponseEntity<List<ProgressData>> getSessionsByRelevance() {
        return ResponseEntity.ok(progressService.getSessionsByRelevance());
    }

    @PostMapping("/data/dismiss/{id}")
    public ResponseEntity<List<ProgressData>> dismissProgressData(@PathVariable Long id) {
        return ResponseEntity.ok((progressService.dismissProgressData(id)));
    }

    @GetMapping("/json/{sessionId}")
    public ResponseEntity<JsonNode> getSessionJSON(@PathVariable String sessionId) {
        return ResponseEntity.ok(progressService.getSessionJSON(sessionId));
    }

    @GetMapping("/image/{sessionId}/{filename}")
    public ResponseEntity<Resource> getStoredImage(@PathVariable String sessionId, @PathVariable String filename) {
        try {
            // Use WebClient to fetch the image
            Resource imageResource = progressService.getSessionImage(sessionId, filename);

            if (imageResource == null) {
                return ResponseEntity.notFound().build();
            }

            // Determine content type based on file extension
            MediaType mediaType = getMediaTypeFromFilename(filename);

            return ResponseEntity.ok()
                    .contentType(mediaType)
                    .header(HttpHeaders.CACHE_CONTROL, "max-age=3600") // Cache for 1 hour
                    .body(imageResource);

        } catch (Exception e) {
            // Log the error
            System.err.println("Error fetching stored image: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/image/hash/{sessionId}/{filename}")
    public ResponseEntity<String> getStoredImageHash(@PathVariable String sessionId, @PathVariable String filename) {
        try {
            // Use WebClient to fetch the image
            String hash = progressService.getSessionImageHash(sessionId, filename);

            if (hash.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            // Determine content type based on file extension
            MediaType mediaType = getMediaTypeFromFilename(hash);

            return ResponseEntity.ok()
                    .contentType(mediaType)
                    .header(HttpHeaders.CACHE_CONTROL, "max-age=3600") // Cache for 1 hour
                    .body(hash);

        } catch (Exception e) {
            // Log the error
            System.err.println("Error fetching stored image: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/evaluation/{sessionId}")
    public ResponseEntity<?> getEvaluationUrl(@PathVariable String sessionId, HttpServletRequest request) {
        String host = request.getServerName() + ":" + infernoComicsConfig.getRecognitionServerPort();
        String url = host + "/inferno-comics-recognition/api/v1/evaluation/" + sessionId;

        Map<String, String> response = new HashMap<>();
        response.put("evaluationUrl", url);
        return ResponseEntity.ok(response);
    }

    private MediaType getMediaTypeFromFilename(String filename) {
        String extension = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();

        return switch (extension) {
            case "png" -> MediaType.IMAGE_PNG;
            case "gif" -> MediaType.IMAGE_GIF;
            case "webp" -> MediaType.parseMediaType("image/webp");
            case "bmp" -> MediaType.parseMediaType("image/bmp");
            default -> MediaType.IMAGE_JPEG;
        };
    }

    @Data
    public static class CompletionRequest {
        private String sessionId;
        private JsonNode result;
    }

    @Data
    public static class ErrorRequest {
        private String sessionId;
        private String error;
    }
}