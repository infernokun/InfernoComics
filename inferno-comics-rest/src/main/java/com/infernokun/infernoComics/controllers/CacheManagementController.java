package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.services.ComicBookService;
import com.infernokun.infernoComics.services.SeriesService;
import com.infernokun.infernoComics.services.ComicVineService;
import com.infernokun.infernoComics.services.DescriptionGeneratorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/admin/cache")
public class CacheManagementController {

    private final ComicBookService comicBookService;
    private final SeriesService seriesService;
    private final ComicVineService comicVineService;
    private final DescriptionGeneratorService descriptionGeneratorService;

    public CacheManagementController(ComicBookService comicBookService,
                                     SeriesService seriesService,
                                     ComicVineService comicVineService,
                                     DescriptionGeneratorService descriptionGeneratorService) {
        this.comicBookService = comicBookService;
        this.seriesService = seriesService;
        this.comicVineService = comicVineService;
        this.descriptionGeneratorService = descriptionGeneratorService;
    }

    // Get comprehensive cache statistics
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getCacheStats() {
        try {
            Map<String, Object> allStats = new HashMap<>();

            // Get Comic Vine cache stats
            Map<String, Object> comicVineStats = comicVineService.getCacheStats();
            allStats.put("comicVine", comicVineStats);

            // Get Description Generator cache stats
            Map<String, Object> descriptionStats = descriptionGeneratorService.getCacheStats();
            allStats.put("descriptions", descriptionStats);

            // Add cache type information
            allStats.put("cacheTypes", Map.of(
                    "comicBooks", new String[]{"comic-book", "all-comic-books", "comic-books-by-series", "key-issues", "comic-book-stats", "recent-comic-books", "comic-book-search"},
                    "series", new String[]{"series", "all-series", "series-search", "series-stats", "recent-series", "series-advanced-search", "popular-series"},
                    "comicVine", new String[]{"comic-vine-series", "comic-vine-issues", "comic-vine-series-search", "comic-vine-issues-search"},
                    "descriptions", new String[]{"comic-descriptions", "comic-metadata", "series-info"}
            ));

            return ResponseEntity.ok(allStats);
        } catch (Exception e) {
            log.error("Error getting cache statistics: {}", e.getMessage());
            return ResponseEntity.ok(Map.of("error", "Unable to retrieve cache statistics"));
        }
    }

    // Clear all caches
    @DeleteMapping("/all")
    public ResponseEntity<Map<String, String>> clearAllCaches() {
        try {
            log.info("Clearing all application caches");

            comicBookService.clearAllComicBookCaches();
            seriesService.clearAllSeriesCaches();
            comicVineService.clearAllComicVineCache();
            descriptionGeneratorService.clearAllDescriptionCache();

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "All caches cleared successfully"
            ));
        } catch (Exception e) {
            log.error("Error clearing all caches: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "status", "error",
                    "message", "Failed to clear all caches: " + e.getMessage()
            ));
        }
    }

    // Clear comic book related caches
    @DeleteMapping("/comic-books")
    public ResponseEntity<Map<String, String>> clearComicBookCaches() {
        try {
            log.info("Clearing comic book caches");
            comicBookService.clearAllComicBookCaches();

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Comic book caches cleared successfully"
            ));
        } catch (Exception e) {
            log.error("Error clearing comic book caches: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "status", "error",
                    "message", "Failed to clear comic book caches: " + e.getMessage()
            ));
        }
    }

    // Clear series related caches
    @DeleteMapping("/series")
    public ResponseEntity<Map<String, String>> clearSeriesCaches() {
        try {
            log.info("Clearing series caches");
            seriesService.clearAllSeriesCaches();

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Series caches cleared successfully"
            ));
        } catch (Exception e) {
            log.error("Error clearing series caches: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "status", "error",
                    "message", "Failed to clear series caches: " + e.getMessage()
            ));
        }
    }

    // Clear Comic Vine related caches
    @DeleteMapping("/comic-vine")
    public ResponseEntity<Map<String, String>> clearComicVineCaches() {
        try {
            log.info("Clearing Comic Vine caches");
            comicVineService.clearAllComicVineCache();

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Comic Vine caches cleared successfully"
            ));
        } catch (Exception e) {
            log.error("Error clearing Comic Vine caches: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "status", "error",
                    "message", "Failed to clear Comic Vine caches: " + e.getMessage()
            ));
        }
    }

    // Clear description related caches
    @DeleteMapping("/descriptions")
    public ResponseEntity<Map<String, String>> clearDescriptionCaches() {
        try {
            log.info("Clearing description caches");
            descriptionGeneratorService.clearAllDescriptionCache();

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Description caches cleared successfully"
            ));
        } catch (Exception e) {
            log.error("Error clearing description caches: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "status", "error",
                    "message", "Failed to clear description caches: " + e.getMessage()
            ));
        }
    }

    // Refresh specific cache by invalidating and pre-warming
    @PostMapping("/refresh/comic-vine-series")
    public ResponseEntity<Map<String, String>> refreshComicVineSeriesCache(@RequestParam String query) {
        try {
            log.info("Refreshing Comic Vine series cache for query: {}", query);

            // This will refresh the cache by making a new API call
            comicVineService.refreshSeriesSearch(query);

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Comic Vine series cache refreshed for query: " + query
            ));
        } catch (Exception e) {
            log.error("Error refreshing Comic Vine series cache: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "status", "error",
                    "message", "Failed to refresh Comic Vine series cache: " + e.getMessage()
            ));
        }
    }

    @PostMapping("/refresh/comic-vine-issues")
    public ResponseEntity<Map<String, String>> refreshComicVineIssuesCache(@RequestParam String seriesId) {
        try {
            log.info("Refreshing Comic Vine issues cache for series: {}", seriesId);

            // This will refresh the cache by making a new API call
            comicVineService.refreshIssuesSearch(seriesId);

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Comic Vine issues cache refreshed for series: " + seriesId
            ));
        } catch (Exception e) {
            log.error("Error refreshing Comic Vine issues cache: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "status", "error",
                    "message", "Failed to refresh Comic Vine issues cache: " + e.getMessage()
            ));
        }
    }

    // Invalidate specific description cache
    @DeleteMapping("/descriptions/specific")
    public ResponseEntity<Map<String, String>> invalidateSpecificDescription(
            @RequestParam String seriesName,
            @RequestParam String issueNumber,
            @RequestParam(required = false) String issueTitle) {
        try {
            log.info("Invalidating description cache for: {} #{} - {}", seriesName, issueNumber, issueTitle);

            descriptionGeneratorService.invalidateDescription(seriesName, issueNumber, issueTitle);

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Description cache invalidated for " + seriesName + " #" + issueNumber
            ));
        } catch (Exception e) {
            log.error("Error invalidating specific description cache: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "status", "error",
                    "message", "Failed to invalidate description cache: " + e.getMessage()
            ));
        }
    }
}