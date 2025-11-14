package com.infernokun.infernoComics.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.infernokun.infernoComics.models.RecognitionConfig;
import com.infernokun.infernoComics.services.RecognitionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/recog")
public class RecognitionController {
    private final RecognitionService recognitionService;

    @GetMapping("/config")
    public ResponseEntity<RecognitionConfig> getRecognitionConfig() {
        return ResponseEntity.ok(recognitionService.getRecognitionConfig());
    }

    @PostMapping("/config")
    public ResponseEntity<Boolean> saveRecognitionConfig(@RequestBody RecognitionConfig config) {
        return ResponseEntity.ok(recognitionService.saveRecognitionConfig(config));
    }

    @GetMapping("/json/{sessionId}")
    public ResponseEntity<JsonNode> getSessionJSON(@PathVariable String sessionId) {
        return ResponseEntity.ok(recognitionService.getSessionJSON(sessionId));
    }

    @GetMapping("/image/{sessionId}/{filename}")
    public ResponseEntity<Resource> getStoredImage(@PathVariable String sessionId, @PathVariable String filename) {
        try {
            // Use WebClient to fetch the image
            Resource imageResource = recognitionService.getSessionImage(sessionId, filename);

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
            log.error("Error fetching stored image: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/image/hash/{sessionId}/{filename}")
    public ResponseEntity<String> getStoredImageHash(@PathVariable String sessionId, @PathVariable String filename) {
        try {
            // Use WebClient to fetch the image
            String hash = recognitionService.getSessionImageHash(sessionId, filename);

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
            log.error("Error fetching stored image hash: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
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
}
