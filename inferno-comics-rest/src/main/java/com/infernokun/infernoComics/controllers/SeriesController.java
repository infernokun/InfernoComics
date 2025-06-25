package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.services.ComicVineService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Slf4j
@RestController
@RequestMapping("/api/series")
@CrossOrigin(origins = "http://localhost:4200")
public class SeriesController {

    @Autowired
    private SeriesRepository seriesRepository;

    @Autowired
    private ComicVineService comicVineService;

    @GetMapping
    public List<Series> getAllSeries() {
        return seriesRepository.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Series> getSeriesById(@PathVariable Long id) {
        Optional<Series> series = seriesRepository.findById(id);
        return series.map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public Series createSeries(@RequestBody Series series) {
        log.info("Creating series: {}", series.getName());
        return seriesRepository.save(series);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Series> updateSeries(@PathVariable Long id, @RequestBody Series seriesDetails) {
        Optional<Series> optionalSeries = seriesRepository.findById(id);

        if (optionalSeries.isPresent()) {
            Series series = optionalSeries.get();
            series.setName(seriesDetails.getName());
            series.setPublisher(seriesDetails.getPublisher());
            series.setStartYear(seriesDetails.getStartYear());
            series.setDescription(seriesDetails.getDescription());
            series.setImageUrl(seriesDetails.getImageUrl());
            series.setComicVineId(seriesDetails.getComicVineId());

            log.info("Updating series: {}", series.getName());
            return ResponseEntity.ok(seriesRepository.save(series));
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSeries(@PathVariable Long id) {
        if (seriesRepository.existsById(id)) {
            log.info("Deleting series with ID: {}", id);
            seriesRepository.deleteById(id);
            return ResponseEntity.ok().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/search")
    public List<Series> searchSeries(@RequestParam String query) {
        log.info("Searching series with query: {}", query);
        return seriesRepository.findByNameContainingIgnoreCaseOrPublisherContainingIgnoreCase(query, query);
    }

    // Comic Vine integration endpoints
    @GetMapping("/search-comic-vine")
    public ResponseEntity<List<ComicVineService.ComicVineSeriesDto>> searchComicVineSeries(@RequestParam String query) {
        try {
            List<ComicVineService.ComicVineSeriesDto> results = comicVineService.searchSeries(query);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Error in Comic Vine search: {}", e.getMessage());
            return ResponseEntity.ok(new ArrayList<>());
        }
    }

    @GetMapping("/{seriesId}/search-comic-vine")
    public ResponseEntity<List<ComicVineService.ComicVineIssueDto>> searchComicVineIssues(@PathVariable Long seriesId) {
        try {
            Optional<Series> series = seriesRepository.findById(seriesId);
            if (series.isPresent() && series.get().getComicVineId() != null) {
                List<ComicVineService.ComicVineIssueDto> results = comicVineService.searchIssues(series.get().getComicVineId());
                return ResponseEntity.ok(results);
            }
            log.warn("Series {} not found or has no Comic Vine ID", seriesId);
            return ResponseEntity.ok(new ArrayList<>());
        } catch (Exception e) {
            log.error("Error in Comic Vine issues search: {}", e.getMessage());
            return ResponseEntity.ok(new ArrayList<>());
        }
    }

    // Statistics
    @GetMapping("/stats")
    public ResponseEntity<Object> getSeriesStats() {
        try {
            long totalSeries = seriesRepository.count();
            return ResponseEntity.ok(java.util.Map.of("totalSeries", totalSeries));
        } catch (Exception e) {
            log.error("Error getting series stats: {}", e.getMessage());
            return ResponseEntity.ok(java.util.Map.of("totalSeries", 0));
        }
    }

    // Recent series
    @GetMapping("/recent")
    public List<Series> getRecentSeries(@RequestParam(defaultValue = "10") int limit) {
        log.info("Getting {} recent series", limit);
        return seriesRepository.findRecentSeries(limit);
    }
}