package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.services.SeriesService;
import com.infernokun.infernoComics.services.ComicVineService;
import com.infernokun.infernoComics.services.ProgressService;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/series")
public class SeriesController {

    private final SeriesService seriesService;
    private final ProgressService progressService;

    public SeriesController(SeriesService seriesService, ProgressService progressService) {
        this.seriesService = seriesService;
        this.progressService = progressService;
    }

    @GetMapping
    public ResponseEntity<List<Series>> getAllSeries() {
        try {
            List<Series> series = seriesService.getAllSeries();
            return ResponseEntity.ok(series);
        } catch (Exception e) {
            log.error("Error fetching all series: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<Series> getSeriesById(@PathVariable Long id) {
        try {
            Optional<Series> series = seriesService.getSeriesById(id);
            return series.map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            log.error("Error fetching series {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/search")
    public ResponseEntity<List<Series>> searchSeries(@RequestParam String query) {
        try {
            List<Series> results = seriesService.searchSeries(query);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Error searching series: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/search/advanced")
    public ResponseEntity<List<Series>> searchSeriesAdvanced(
            @RequestParam(required = false) String publisher,
            @RequestParam(required = false) Integer startYear,
            @RequestParam(required = false) Integer endYear) {
        try {
            List<Series> results = seriesService.searchSeriesByPublisherAndYear(publisher, startYear, endYear);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Error in advanced series search: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/recent")
    public ResponseEntity<List<Series>> getRecentSeries(@RequestParam(defaultValue = "10") int limit) {
        try {
            List<Series> recentSeries = seriesService.getRecentSeries(limit);
            return ResponseEntity.ok(recentSeries);
        } catch (Exception e) {
            log.error("Error fetching recent series: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/popular")
    public ResponseEntity<List<Series>> getPopularSeries(@RequestParam(defaultValue = "10") int limit) {
        try {
            List<Series> popularSeries = seriesService.getPopularSeries(limit);
            return ResponseEntity.ok(popularSeries);
        } catch (Exception e) {
            log.error("Error fetching popular series: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getSeriesStats() {
        try {
            Map<String, Object> stats = seriesService.getSeriesStats();
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            log.error("Error fetching series statistics: {}", e.getMessage());
            return ResponseEntity.ok(Map.of("error", "Unable to fetch statistics"));
        }
    }

    // Comic Vine integration endpoints
    @GetMapping("/search-comic-vine")
    public ResponseEntity<List<ComicVineService.ComicVineSeriesDto>> searchComicVineSeries(@RequestParam String query) {
        try {
            List<ComicVineService.ComicVineSeriesDto> results = seriesService.searchComicVineSeries(query);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Error searching Comic Vine series: {}", e.getMessage());
            return ResponseEntity.ok(List.of()); // Return empty list instead of error for UX
        }
    }

    @GetMapping("/{seriesId}/search-comic-vine")
    public ResponseEntity<List<ComicVineService.ComicVineIssueDto>> searchComicVineIssues(@PathVariable Long seriesId) {
        try {
            List<ComicVineService.ComicVineIssueDto> results = seriesService.searchComicVineIssues(seriesId);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Error searching Comic Vine issues for series {}: {}", seriesId, e.getMessage());
            return ResponseEntity.ok(List.of()); // Return empty list instead of error for UX
        }
    }

    @PostMapping
    public ResponseEntity<Series> createSeries(@Valid @RequestBody SeriesCreateRequestDto request) {
        try {
            Series series = seriesService.createSeries(request);
            return ResponseEntity.ok(series);
        } catch (Exception e) {
            log.error("Error creating series: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/from-comic-vine")
    public ResponseEntity<Series> createSeriesFromComicVine(
            @RequestParam String comicVineId,
            @RequestBody ComicVineService.ComicVineSeriesDto comicVineData) {
        try {
            Series series = seriesService.createSeriesFromComicVine(comicVineId, comicVineData);
            return ResponseEntity.ok(series);
        } catch (Exception e) {
            log.error("Error creating series from Comic Vine: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/batch/from-comic-vine")
    public ResponseEntity<List<Series>> createMultipleSeriesFromComicVine(
            @RequestBody List<ComicVineService.ComicVineSeriesDto> comicVineSeriesList) {
        try {
            List<Series> series = seriesService.createMultipleSeriesFromComicVine(comicVineSeriesList);
            return ResponseEntity.ok(series);
        } catch (Exception e) {
            log.error("Error batch creating series from Comic Vine: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("{seriesId}/add-comic-by-image/start")
    public ResponseEntity<Map<String, String>> startImageProcessing(
            @PathVariable Long seriesId,
            @RequestParam("image") MultipartFile imageFile,
            @RequestParam(value = "name", required = false, defaultValue = "") String name,
            @RequestParam(value = "year", required = false, defaultValue = "0") Integer year) {

        try {
            // Validate image
            if (imageFile.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Image file is missing."));
            }

            // IMPORTANT: Read image bytes immediately before async processing
            // This prevents the temp file from being cleaned up by Tomcat
            byte[] imageBytes;
            try {
                imageBytes = imageFile.getBytes();
                log.info("Read {} bytes from uploaded file: {}", imageBytes.length, imageFile.getOriginalFilename());
            } catch (IOException e) {
                log.error("Failed to read image bytes: {}", e.getMessage());
                return ResponseEntity.badRequest().body(Map.of("error", "Failed to read image file."));
            }

            // Generate unique session ID
            String sessionId = UUID.randomUUID().toString();

            log.info("Starting image processing session: {} for series: {}", sessionId, seriesId);

            // IMPORTANT: Initialize the session in progress service BEFORE starting async processing
            progressService.initializeSession(sessionId, seriesId);

            // Start async processing with image bytes instead of MultipartFile
            seriesService.startImageProcessingWithProgress(sessionId, seriesId, imageBytes,
                    imageFile.getOriginalFilename(), imageFile.getContentType(), name, year);

            return ResponseEntity.ok(Map.of("sessionId", sessionId));

        } catch (Exception e) {
            log.error("Error starting image processing: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Error starting image processing: " + e.getMessage()));
        }
    }


    @CrossOrigin(origins = "*", allowCredentials = "false")
    @GetMapping(value = "{seriesId}/add-comic-by-image/progress", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter getImageProcessingProgress(
            @PathVariable Long seriesId,
            @RequestParam String sessionId) {

        log.info("Client connecting to SSE progress stream for session: {} (series: {})", sessionId, seriesId);

        try {
            SseEmitter emitter = progressService.createProgressEmitter(sessionId);
            log.info("SSE emitter created successfully for session: {}", sessionId);
            return emitter;
        } catch (Exception e) {
            log.error("Failed to create SSE emitter for session {}: {}", sessionId, e.getMessage(), e);

            // Return a failed emitter
            SseEmitter errorEmitter = new SseEmitter(1000L);
            try {
                errorEmitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"error\":\"Failed to create progress stream\"}"));
                errorEmitter.complete();
            } catch (Exception sendError) {
                log.error("Failed to send error via SSE: {}", sendError.getMessage());
            }
            return errorEmitter;
        }
    }

    @CrossOrigin(origins = "*", allowCredentials = "false")
    @GetMapping(value = "{seriesId}/add-comics-by-images/progress", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter getMultipleImagesProcessingProgress(
            @PathVariable Long seriesId,
            @RequestParam String sessionId) {

        log.info("Client connecting to SSE progress stream for multiple images session: {} (series: {})", sessionId, seriesId);

        try {
            SseEmitter emitter = progressService.createProgressEmitter(sessionId);
            log.info("SSE emitter created successfully for multiple images session: {}", sessionId);
            return emitter;
        } catch (Exception e) {
            log.error("Failed to create SSE emitter for session {}: {}", sessionId, e.getMessage(), e);

            // Return a failed emitter
            SseEmitter errorEmitter = new SseEmitter(1000L);
            try {
                errorEmitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"error\":\"Failed to create progress stream\"}"));
                errorEmitter.complete();
            } catch (Exception sendError) {
                log.error("Failed to send error via SSE: {}", sendError.getMessage());
            }
            return errorEmitter;
        }
    }

    @PostMapping("{seriesId}/add-comics-by-images/start")
    public ResponseEntity<Map<String, String>> startImagesProcessing(
            @PathVariable Long seriesId,
            @RequestParam("images") MultipartFile[] imageFiles,
            @RequestParam(value = "name", required = false, defaultValue = "") String name,
            @RequestParam(value = "year", required = false, defaultValue = "0") Integer year) {

        try {
            // Validate images
            if (imageFiles == null || imageFiles.length == 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "No image files provided."));
            }

            // Check for empty files
            for (MultipartFile file : imageFiles) {
                if (file.isEmpty()) {
                    return ResponseEntity.badRequest().body(Map.of("error", "One or more image files are empty."));
                }
            }

            // IMPORTANT: Read all image bytes immediately before async processing
            List<ImageData> imageDataList = new ArrayList<>();
            try {
                for (MultipartFile file : imageFiles) {
                    byte[] imageBytes = file.getBytes();
                    imageDataList.add(new ImageData(
                            imageBytes,
                            file.getOriginalFilename(),
                            file.getContentType()
                    ));
                    log.info("Read {} bytes from uploaded file: {}", imageBytes.length, file.getOriginalFilename());
                }
            } catch (IOException e) {
                log.error("Failed to read image bytes: {}", e.getMessage());
                return ResponseEntity.badRequest().body(Map.of("error", "Failed to read image files."));
            }

            // Generate unique session ID
            String sessionId = UUID.randomUUID().toString();

            log.info("Starting multiple images processing session: {} for series: {} with {} images",
                    sessionId, seriesId, imageDataList.size());

            // IMPORTANT: Initialize the session in progress service BEFORE starting async processing
            progressService.initializeSession(sessionId, seriesId);

            // Start async processing with image data list
            seriesService.startMultipleImagesProcessingWithProgress(sessionId, seriesId, imageDataList, name, year);

            return ResponseEntity.ok(Map.of("sessionId", sessionId));

        } catch (Exception e) {
            log.error("Error starting multiple images processing: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Error starting images processing: " + e.getMessage()));
        }
    }


    @PutMapping("/{id}")
    public ResponseEntity<Series> updateSeries(@PathVariable Long id, @Valid @RequestBody SeriesUpdateRequestDto request) {
        try {
            Series series = seriesService.updateSeries(id, request);
            return ResponseEntity.ok(series);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid request for updating series {}: {}", id, e.getMessage());
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Error updating series {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSeries(@PathVariable Long id) {
        try {
            seriesService.deleteSeries(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            log.warn("Series {} not found for deletion", id);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Error deleting series {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/cache")
    public ResponseEntity<Void> clearSeriesCaches() {
        try {
            seriesService.clearAllSeriesCaches();
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Error clearing series caches: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/cache/comic-vine")
    public ResponseEntity<Void> refreshComicVineCache() {
        try {
            seriesService.refreshComicVineCache();
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Error refreshing Comic Vine cache: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @Setter
    @Getter
    public static class SeriesCreateRequestDto {
        private String name;
        private String description;
        private String publisher;
        private Integer startYear;
        private Integer endYear;
        private String imageUrl;
        private List<String> comicVineIds;
        private int issueCount;
        private boolean generatedDescription;
        private String comicVineId;
    }

    @Setter
    @Getter
    public static class SeriesUpdateRequestDto implements SeriesService.SeriesUpdateRequest {
        private String name;
        private String description;
        private String publisher;
        private Integer startYear;
        private Integer endYear;
        private String imageUrl;
        private List<String> comicVineIds;
        private int issueCount;
        private String comicVineId;
    }

    @Data
    public static class ImageData {
        private final byte[] bytes;
        private final String originalFilename;
        private final String contentType;

        public ImageData(byte[] bytes, String originalFilename, String contentType) {
            this.bytes = bytes;
            this.originalFilename = originalFilename;
            this.contentType = contentType;
        }
    }
}