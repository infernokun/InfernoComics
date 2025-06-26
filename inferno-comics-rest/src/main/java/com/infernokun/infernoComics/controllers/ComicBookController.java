package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.ComicBook;
import com.infernokun.infernoComics.services.ComicBookService;
import com.infernokun.infernoComics.services.ComicVineService;
import jakarta.validation.Valid;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@RestController
@RequestMapping("/api/comic-books")
@CrossOrigin(origins = "http://localhost:4200")
public class ComicBookController {

    private final ComicBookService comicBookService;

    public ComicBookController(ComicBookService comicBookService) {
        this.comicBookService = comicBookService;
    }

    @GetMapping
    public ResponseEntity<List<ComicBook>> getAllComicBooks() {
        try {
            List<ComicBook> comicBooks = comicBookService.getAllComicBooks();
            return ResponseEntity.ok(comicBooks);
        } catch (Exception e) {
            log.error("Error fetching all comic books: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<ComicBook> getComicBookById(@PathVariable Long id) {
        try {
            Optional<ComicBook> comicBook = comicBookService.getComicBookById(id);
            return comicBook.map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            log.error("Error fetching comic book {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/series/{seriesId}")
    public ResponseEntity<List<ComicBook>> getComicBooksBySeriesId(@PathVariable Long seriesId) {
        try {
            List<ComicBook> comicBooks = comicBookService.getComicBooksBySeriesId(seriesId);
            return ResponseEntity.ok(comicBooks);
        } catch (Exception e) {
            log.error("Error fetching comic books for series {}: {}", seriesId, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{seriesId}/search-comic-vine")
    public ResponseEntity<List<ComicVineService.ComicVineIssueDto>> searchComicVineIssues(@PathVariable Long seriesId) {
        try {
            List<ComicVineService.ComicVineIssueDto> issues = comicBookService.searchComicVineIssues(seriesId);
            return ResponseEntity.ok(issues);
        } catch (Exception e) {
            log.error("Error searching Comic Vine issues for series {}: {}", seriesId, e.getMessage());
            return ResponseEntity.ok(List.of()); // Return empty list instead of error for UX
        }
    }

    @GetMapping("/key-issues")
    public ResponseEntity<List<ComicBook>> getKeyIssues() {
        try {
            List<ComicBook> keyIssues = comicBookService.getKeyIssues();
            return ResponseEntity.ok(keyIssues);
        } catch (Exception e) {
            log.error("Error fetching key issues: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/search")
    public ResponseEntity<List<ComicBook>> searchComicBooks(
            @RequestParam String query,
            @RequestParam(defaultValue = "20") int limit) {
        try {
            List<ComicBook> results = comicBookService.searchComicBooks(query, limit);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Error searching comic books: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/recent")
    public ResponseEntity<List<ComicBook>> getRecentComicBooks(@RequestParam(defaultValue = "10") int limit) {
        try {
            List<ComicBook> recentComics = comicBookService.getRecentComicBooks(limit);
            return ResponseEntity.ok(recentComics);
        } catch (Exception e) {
            log.error("Error fetching recent comic books: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getComicBookStats() {
        try {
            Map<String, Object> stats = comicBookService.getComicBookStats();
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            log.error("Error fetching comic book statistics: {}", e.getMessage());
            return ResponseEntity.ok(Map.of("error", "Unable to fetch statistics"));
        }
    }

    @PostMapping
    public ResponseEntity<ComicBook> createComicBook(@Valid @RequestBody ComicBookCreateRequestDto request) {
        try {
            ComicBook comicBook = comicBookService.createComicBook(request);
            return ResponseEntity.ok(comicBook);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid request for creating comic book: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            log.error("Error creating comic book: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/batch/from-comic-vine")
    public ResponseEntity<List<ComicBook>> createComicBooksFromComicVine(
            @RequestParam Long seriesId,
            @RequestBody List<String> comicVineIssueIds) {
        try {
            List<ComicBook> comicBooks = comicBookService.createComicBooksFromComicVine(seriesId, comicVineIssueIds);
            return ResponseEntity.ok(comicBooks);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid request for batch creating comic books: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            log.error("Error batch creating comic books from Comic Vine: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<ComicBook> updateComicBook(@PathVariable Long id, @Valid @RequestBody ComicBookUpdateRequestDto request) {
        try {
            ComicBook comicBook = comicBookService.updateComicBook(id, request);
            return ResponseEntity.ok(comicBook);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid request for updating comic book {}: {}", id, e.getMessage());
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Error updating comic book {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteComicBook(@PathVariable Long id) {
        try {
            comicBookService.deleteComicBook(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            log.warn("Comic book {} not found for deletion", id);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Error deleting comic book {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/cache")
    public ResponseEntity<Void> clearComicBookCaches() {
        try {
            comicBookService.clearAllComicBookCaches();
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Error clearing comic book caches: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    // DTO Classes
    @Setter
    @Getter
    public static class ComicBookCreateRequestDto implements ComicBookService.ComicBookCreateRequest {
        private Long seriesId;
        private String issueNumber;
        private String title;
        private String description;
        private LocalDate coverDate;
        private String imageUrl;
        private ComicBook.Condition condition;
        private BigDecimal purchasePrice;
        private BigDecimal currentValue;
        private LocalDate purchaseDate;
        private String notes;
        private String comicVineId;
        private Boolean isKeyIssue;
    }

    @Setter
    @Getter
    public static class ComicBookUpdateRequestDto implements ComicBookService.ComicBookUpdateRequest {
        private String issueNumber;
        private String title;
        private String description;
        private LocalDate coverDate;
        private String imageUrl;
        private ComicBook.Condition condition;
        private BigDecimal purchasePrice;
        private BigDecimal currentValue;
        private LocalDate purchaseDate;
        private String notes;
        private String comicVineId;
        private Boolean isKeyIssue;
    }
}