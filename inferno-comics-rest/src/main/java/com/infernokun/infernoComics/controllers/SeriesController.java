package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.services.SeriesService;
import com.infernokun.infernoComics.services.ComicVineService;
import jakarta.validation.Valid;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@RestController
@RequestMapping("/api/series")
public class SeriesController {

    private final SeriesService seriesService;

    public SeriesController(SeriesService seriesService) {
        this.seriesService = seriesService;
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

    // DTO Classes
    @Setter
    @Getter
    public static class SeriesCreateRequestDto implements SeriesService.SeriesCreateRequest {
        private String name;
        private String description;
        private String publisher;
        private Integer startYear;
        private Integer endYear;
        private String imageUrl;
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
        private String comicVineId;
    }
}