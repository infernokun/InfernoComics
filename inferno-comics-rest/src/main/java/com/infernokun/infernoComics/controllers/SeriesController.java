package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.services.ComicVineService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

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
        Optional<Series> series = seriesRepository.findByIdWithComicBooks(id);
        return series.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/search")
    public List<Series> searchSeries(@RequestParam String name) {
        return seriesRepository.findByNameContainingIgnoreCase(name);
    }

    @GetMapping("/search-comic-vine")
    public List<ComicVineService.ComicVineSeriesDto> searchComicVineSeries(@RequestParam String query) {
        return comicVineService.searchSeries(query);
    }

    @PostMapping
    public Series createSeries(@Valid @RequestBody Series series) {
        return seriesRepository.save(series);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Series> updateSeries(@PathVariable Long id, @Valid @RequestBody Series seriesDetails) {
        Optional<Series> optionalSeries = seriesRepository.findById(id);

        if (optionalSeries.isPresent()) {
            Series series = optionalSeries.get();
            series.setName(seriesDetails.getName());
            series.setDescription(seriesDetails.getDescription());
            series.setPublisher(seriesDetails.getPublisher());
            series.setStartYear(seriesDetails.getStartYear());
            series.setEndYear(seriesDetails.getEndYear());
            series.setImageUrl(seriesDetails.getImageUrl());
            series.setComicVineId(seriesDetails.getComicVineId());

            return ResponseEntity.ok(seriesRepository.save(series));
        }

        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSeries(@PathVariable Long id) {
        if (seriesRepository.existsById(id)) {
            seriesRepository.deleteById(id);
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }
}