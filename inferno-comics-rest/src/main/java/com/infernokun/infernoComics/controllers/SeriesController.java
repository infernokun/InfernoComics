package com.infernokun.infernoComics.controllers;

import com.fasterxml.jackson.databind.JsonNode;
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
            return ResponseEntity.ok( seriesService.getSeriesById(id));
        } catch (Exception e) {
            log.error("Error fetching series {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/get-comic-vine/{comicVineId}")
    public ResponseEntity<ComicVineService.ComicVineSeriesDto> getComicVineSeriesById(@PathVariable Long comicVineId) {
        return ResponseEntity.ok(seriesService.getComicVineSeriesById(comicVineId));
    }

    @GetMapping("/search")
    public ResponseEntity<List<Series>> searchSeries(@RequestParam String query) {
        try {
            List<Series> results = seriesService.searchSeries(query);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Error searching series with query '{}': {}", query, e.getMessage());
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
            log.error("Error in advanced series search (publisher: {}, years: {}-{}): {}",
                    publisher, startYear, endYear, e.getMessage());
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
            log.error("Error searching Comic Vine series with query '{}': {}", query, e.getMessage());
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
            log.error("Error creating series '{}': {}", request.getName(), e.getMessage());
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
            log.error("Error creating series '{}' from Comic Vine ID {}: {}",
                    comicVineData.getName(), comicVineId, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/batch/from-comic-vine")
    public ResponseEntity<List<Series>> createMultipleSeriesFromComicVine(
            @RequestBody List<ComicVineService.ComicVineSeriesDto> comicVineSeriesList) {
        try {
            List<Series> series = seriesService.createMultipleSeriesFromComicVine(comicVineSeriesList);
            log.info("Successfully batch created {} series from Comic Vine", series.size());
            return ResponseEntity.ok(series);
        } catch (Exception e) {
            log.error("Error batch creating {} series from Comic Vine: {}",
                    comicVineSeriesList.size(), e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/reverify-metadata/{seriesId}")
    public ResponseEntity<Series> reverifyMetadata(@PathVariable Long seriesId) {
        try {
            Series series = seriesService.reverifyMetadata(seriesId);
            return ResponseEntity.ok(series);
        } catch (Exception e) {
            log.error("Error reverifying metadata for series {}: {}", seriesId, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @CrossOrigin(origins = "*", allowCredentials = "false")
    @GetMapping(value = "{seriesId}/add-comics-by-images/progress", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter getMultipleImagesProcessingProgress(
            @PathVariable Long seriesId,
            @RequestParam String sessionId) {

        log.debug("SSE connection requested for multiple images session: {} (series: {})", sessionId, seriesId);

        try {
            SseEmitter emitter = progressService.createProgressEmitter(sessionId);
            return emitter;
        } catch (Exception e) {
            log.error("Failed to create SSE emitter for multiple images session {}: {}", sessionId, e.getMessage());

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

            // Read all image bytes immediately before async processing
            List<ImageData> imageDataList = new ArrayList<>();
            long totalBytes = 0;
            try {
                for (MultipartFile file : imageFiles) {
                    byte[] imageBytes = file.getBytes();
                    imageDataList.add(new ImageData(
                            imageBytes,
                            file.getOriginalFilename(),
                            file.getContentType()
                    ));
                    totalBytes += imageBytes.length;
                }
            } catch (IOException e) {
                log.error("Failed to read image bytes: {}", e.getMessage());
                return ResponseEntity.badRequest().body(Map.of("error", "Failed to read image files."));
            }

            // Generate unique session ID
            String sessionId = UUID.randomUUID().toString();

            log.info("Starting image processing session {} for series {}: {} images ({} MB total)",
                    sessionId, seriesId, imageDataList.size(), totalBytes / (1024 * 1024));

            progressService.initializeSession(sessionId, seriesId);

            // Start async processing with image data list
            seriesService.startMultipleImagesProcessingWithProgress(sessionId, seriesId, imageDataList, name, year);

            return ResponseEntity.ok(Map.of("sessionId", sessionId));

        } catch (Exception e) {
            log.error("Error starting image processing for series {}: {}", seriesId, e.getMessage());
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
            log.warn("Series {} not found for update", id);
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
            log.info("Successfully cleared all series caches");
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
            log.info("Successfully refreshed Comic Vine cache");
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