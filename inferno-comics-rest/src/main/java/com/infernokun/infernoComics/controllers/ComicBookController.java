package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.logger.InfernoComicsLogger;
import com.infernokun.infernoComics.models.ComicBook;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.repositories.ComicBookRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.services.ComicVineService;
import jakarta.validation.Valid;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/comic-books")
@CrossOrigin(origins = "http://localhost:4200")
public class ComicBookController {

    @Autowired
    private ComicBookRepository comicBookRepository;

    @Autowired
    private SeriesRepository seriesRepository;

    @Autowired
    private ComicVineService comicVineService;

    @GetMapping
    public List<ComicBook> getAllComicBooks() {
        return comicBookRepository.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<ComicBook> getComicBookById(@PathVariable Long id) {
        Optional<ComicBook> comicBook = comicBookRepository.findById(id);
        return comicBook.map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/series/{seriesId}")
    public List<ComicBook> getComicBooksBySeriesId(@PathVariable Long seriesId) {
        return comicBookRepository.findBySeriesIdOrderByIssueNumberAsc(seriesId);
    }

    @GetMapping("/{seriesId}/search-comic-vine")
    public ResponseEntity<List<ComicVineService.ComicVineIssueDto>> searchComicVineIssues(@PathVariable Long seriesId) {
        try {
            Optional<Series> series = seriesRepository.findById(seriesId);
            if (series.isPresent() && series.get().getComicVineId() != null) {
                List<ComicVineService.ComicVineIssueDto> results = comicVineService.searchIssues(series.get().getComicVineId());
                return ResponseEntity.ok(results);
            }
            return ResponseEntity.ok(new ArrayList<>());
        } catch (Exception e) {
            log.error("Error in Comic Vine issues search: {}", e.getMessage());
            return ResponseEntity.ok(new ArrayList<>());
        }
    }

    @GetMapping("/key-issues")
    public List<ComicBook> getKeyIssues() {
        return comicBookRepository.findAll().stream().filter(ComicBook::getIsKeyIssue).toList();
    }

    @PostMapping
    public ResponseEntity<ComicBook> createComicBook(@Valid @RequestBody ComicBookRequest request) {
        Optional<Series> series = seriesRepository.findById(request.getSeriesId());

        if (series.isPresent()) {
            ComicBook comicBook = new ComicBook();
            comicBook.setIssueNumber(request.getIssueNumber());
            comicBook.setTitle(request.getTitle());
            comicBook.setDescription(request.getDescription());
            comicBook.setCoverDate(request.getCoverDate());
            comicBook.setImageUrl(request.getImageUrl());
            comicBook.setCondition(request.getCondition());
            comicBook.setPurchasePrice(request.getPurchasePrice());
            comicBook.setCurrentValue(request.getCurrentValue());
            comicBook.setPurchaseDate(request.getPurchaseDate());
            comicBook.setNotes(request.getNotes());
            comicBook.setComicVineId(request.getComicVineId());
            comicBook.setIsKeyIssue(request.getIsKeyIssue());
            comicBook.setSeries(series.get());

            return ResponseEntity.ok(comicBookRepository.save(comicBook));
        }

        return ResponseEntity.badRequest().build();
    }

    @PutMapping("/{id}")
    public ResponseEntity<ComicBook> updateComicBook(@PathVariable Long id, @Valid @RequestBody ComicBookRequest request) {
        Optional<ComicBook> optionalComicBook = comicBookRepository.findById(id);

        if (optionalComicBook.isPresent()) {
            ComicBook comicBook = optionalComicBook.get();
            comicBook.setIssueNumber(request.getIssueNumber());
            comicBook.setTitle(request.getTitle());
            comicBook.setDescription(request.getDescription());
            comicBook.setCoverDate(request.getCoverDate());
            comicBook.setImageUrl(request.getImageUrl());
            comicBook.setCondition(request.getCondition());
            comicBook.setPurchasePrice(request.getPurchasePrice());
            comicBook.setCurrentValue(request.getCurrentValue());
            comicBook.setPurchaseDate(request.getPurchaseDate());
            comicBook.setNotes(request.getNotes());
            comicBook.setComicVineId(request.getComicVineId());
            comicBook.setIsKeyIssue(request.getIsKeyIssue());

            return ResponseEntity.ok(comicBookRepository.save(comicBook));
        }

        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteComicBook(@PathVariable Long id) {
        if (comicBookRepository.existsById(id)) {
            comicBookRepository.deleteById(id);
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }

    // Request DTO
    @Setter
    @Getter
    public static class ComicBookRequest {
        private Long seriesId;
        private String issueNumber;
        private String title;
        private String description;
        private java.time.LocalDate coverDate;
        private String imageUrl;
        private ComicBook.Condition condition;
        private java.math.BigDecimal purchasePrice;
        private java.math.BigDecimal currentValue;
        private java.time.LocalDate purchaseDate;
        private String notes;
        private String comicVineId;
        private Boolean isKeyIssue;
    }
}