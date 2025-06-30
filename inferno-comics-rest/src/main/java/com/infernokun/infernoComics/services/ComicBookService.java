package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.models.ComicBook;
import com.infernokun.infernoComics.models.DescriptionGenerated;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.repositories.ComicBookRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional
public class ComicBookService {

    private final ComicBookRepository comicBookRepository;
    private final SeriesRepository seriesRepository;
    private final ComicVineService comicVineService;
    private final DescriptionGeneratorService descriptionGeneratorService;

    public ComicBookService(ComicBookRepository comicBookRepository,
                            SeriesRepository seriesRepository,
                            ComicVineService comicVineService,
                            DescriptionGeneratorService descriptionGeneratorService) {
        this.comicBookRepository = comicBookRepository;
        this.seriesRepository = seriesRepository;
        this.comicVineService = comicVineService;
        this.descriptionGeneratorService = descriptionGeneratorService;
    }

    // Cache all comic books with TTL
    @Cacheable(value = "all-comic-books")
    public List<ComicBook> getAllComicBooks() {
        log.info("Fetching all comic books from database");
        return comicBookRepository.findAll();
    }

    // Cache individual comic book
    @Cacheable(value = "comic-book", key = "#id")
    public Optional<ComicBook> getComicBookById(Long id) {
        log.info("Fetching comic book with ID: {}", id);
        return comicBookRepository.findById(id);
    }

    // Cache comic books by series
    @Cacheable(value = "comic-books-by-series", key = "#seriesId")
    public List<ComicBook> getComicBooksBySeriesId(Long seriesId) {
        log.info("Fetching comic books for series ID: {}", seriesId);

        try {
            List<ComicBook> comicBooks = comicBookRepository.findBySeriesIdOrderByIssueNumberAsc(seriesId);

            // Sort the list with custom comparator
            comicBooks.sort((issue1, issue2) -> {
                try {
                    String num1 = issue1.getIssueNumber();
                    String num2 = issue2.getIssueNumber();

                    // Handle null or empty issue numbers
                    if (num1 == null || num1.isEmpty()) return 1;
                    if (num2 == null || num2.isEmpty()) return -1;

                    // Extract numeric part for comparison
                    Double numericPart1 = extractNumericPart(num1);
                    Double numericPart2 = extractNumericPart(num2);

                    int numericComparison = Double.compare(numericPart1, numericPart2);

                    // If numeric parts are equal, compare the full strings
                    if (numericComparison == 0) {
                        return num1.compareToIgnoreCase(num2);
                    }

                    return numericComparison;
                } catch (Exception e) {
                    // Fallback to string comparison if parsing fails
                    String safe1 = issue1.getIssueNumber() != null ? issue1.getIssueNumber() : "";
                    String safe2 = issue2.getIssueNumber() != null ? issue2.getIssueNumber() : "";
                    return safe1.compareToIgnoreCase(safe2);
                }
            });

            return comicBooks;

        } catch (Exception e) {
            log.error("Error fetching comic books for series ID {}: {}", seriesId, e.getMessage(), e);
            return new ArrayList<>(); // Return empty list instead of null
        }
    }

    private Double extractNumericPart(String issueNumber) {
        try {
            // Remove leading/trailing whitespace
            String cleaned = issueNumber.trim();

            // Use regex to find the first decimal number in the string
            Pattern pattern = Pattern.compile("(\\d+(?:\\.\\d+)?)");
            Matcher matcher = pattern.matcher(cleaned);

            if (matcher.find()) {
                return Double.parseDouble(matcher.group(1));
            }

            // If no numeric part found, return a high value to sort to end
            return Double.MAX_VALUE;

        } catch (NumberFormatException e) {
            // If parsing fails, return a high value to sort to end
            return Double.MAX_VALUE;
        }
    }

    // Cache key issues
    @Cacheable(value = "key-issues")
    public List<ComicBook> getKeyIssues() {
        log.info("Fetching key issues");
        return comicBookRepository.findKeyIssues();
    }

    // Cache Comic Vine issues search
    @Cacheable(value = "comic-vine-issues-by-series", key = "#seriesId")
    public List<ComicVineService.ComicVineIssueDto> searchComicVineIssues(Long seriesId) {
        log.info("Searching Comic Vine issues for series ID: {}", seriesId);
        try {
            Optional<Series> series = seriesRepository.findById(seriesId);
            if (series.isPresent() && series.get().getComicVineId() != null) {
                return comicVineService.searchIssues(series.get().getComicVineId());
            }
            return List.of();
        } catch (Exception e) {
            log.error("Error searching Comic Vine issues for series {}: {}", seriesId, e.getMessage());
            return List.of();
        }
    }

    // Create comic book and invalidate relevant caches
    @CacheEvict(value = {"all-comic-books", "comic-books-by-series", "key-issues"}, allEntries = true)
    public ComicBook createComicBook(ComicBookCreateRequest request) {
        log.info("Creating comic book: {} #{}", request.getSeriesId(), request.getIssueNumber());

        Optional<Series> series = seriesRepository.findById(request.getSeriesId());
        if (series.isEmpty()) {
            throw new IllegalArgumentException("Series with ID " + request.getSeriesId() + " not found");
        }

        ComicBook comicBook = new ComicBook();
        mapRequestToComicBook(request, comicBook);
        comicBook.setSeries(series.get());

        // Generate description if not provided
        if (request.getDescription() == null || request.getDescription().trim().isEmpty()) {
            DescriptionGenerated generatedDescription = descriptionGeneratorService.generateDescription(
                    series.get().getName(),
                    request.getIssueNumber(),
                    request.getTitle(),
                    request.getCoverDate() != null ? request.getCoverDate().toString() : null,
                    request.getDescription()
            );
            comicBook.setDescription(generatedDescription.getDescription());
            comicBook.setGeneratedDescription(generatedDescription.isGenerated());
        }

        ComicBook savedComicBook = comicBookRepository.save(comicBook);
        log.info("Created comic book with ID: {}", savedComicBook.getId());
        return savedComicBook;
    }

    // Update comic book and refresh cache
    @CachePut(value = "comic-book", key = "#id")
    @CacheEvict(value = {"all-comic-books", "comic-books-by-series", "key-issues"}, allEntries = true)
    public ComicBook updateComicBook(Long id, ComicBookUpdateRequest request) {
        log.info("Updating comic book with ID: {}", id);

        Optional<ComicBook> optionalComicBook = comicBookRepository.findById(id);
        if (optionalComicBook.isEmpty()) {
            throw new IllegalArgumentException("Comic book with ID " + id + " not found");
        }

        ComicBook comicBook = optionalComicBook.get();
        ComicBook originalComicBook = new ComicBook(); // For cache eviction
        copyComicBook(comicBook, originalComicBook);

        mapRequestToComicBook(request, comicBook);

        ComicBook updatedComicBook = comicBookRepository.save(comicBook);

        // Evict description cache if comic details changed
        descriptionGeneratorService.evictComicCache(updatedComicBook);

        log.info("Updated comic book: {} #{}", comicBook.getSeries().getName(), comicBook.getIssueNumber());
        return updatedComicBook;
    }

    // Delete comic book and invalidate caches
    @CacheEvict(value = {"comic-book", "all-comic-books", "comic-books-by-series", "key-issues"}, allEntries = true)
    public void deleteComicBook(Long id) {
        log.info("Deleting comic book with ID: {}", id);

        if (!comicBookRepository.existsById(id)) {
            throw new IllegalArgumentException("Comic book with ID " + id + " not found");
        }

        // Get comic book for cache eviction before deletion
        Optional<ComicBook> comicBook = comicBookRepository.findById(id);
        comicBook.ifPresent(descriptionGeneratorService::evictComicCache);

        comicBookRepository.deleteById(id);
        log.info("Deleted comic book with ID: {}", id);
    }

    // Cache comic book statistics
    @Cacheable(value = "comic-book-stats")
    public Map<String, Object> getComicBookStats() {
        log.info("Calculating comic book statistics");

        List<ComicBook> allComics = comicBookRepository.findAll();

        long totalComics = allComics.size();
        long keyIssues = allComics.stream().mapToLong(comic -> comic.getIsKeyIssue() ? 1 : 0).sum();

        Map<String, Long> conditionCounts = allComics.stream()
                .filter(comic -> comic.getCondition() != null)
                .collect(Collectors.groupingBy(
                        comic -> comic.getCondition().toString(),
                        Collectors.counting()
                ));

        Map<String, Long> seriesCounts = allComics.stream()
                .collect(Collectors.groupingBy(
                        comic -> comic.getSeries().getName(),
                        Collectors.counting()
                ));

        double totalValue = allComics.stream()
                .filter(comic -> comic.getCurrentValue() != null)
                .mapToDouble(comic -> comic.getCurrentValue().doubleValue())
                .sum();

        return Map.of(
                "totalComics", totalComics,
                "keyIssues", keyIssues,
                "conditionBreakdown", conditionCounts,
                "seriesBreakdown", seriesCounts,
                "totalCollectionValue", totalValue
        );
    }

    // Cache recent comic books
    @Cacheable(value = "recent-comic-books", key = "#limit")
    public List<ComicBook> getRecentComicBooks(int limit) {
        log.info("Fetching {} recent comic books", limit);
        return comicBookRepository.findAll().stream()
                .sorted((c1, c2) -> c2.getCreatedAt().compareTo(c1.getCreatedAt()))
                .limit(limit)
                .collect(Collectors.toList());
    }

    // Search comic books with caching
    @Cacheable(value = "comic-book-search", key = "#query + ':' + #limit")
    public List<ComicBook> searchComicBooks(String query, int limit) {
        log.info("Searching comic books with query: {} (limit: {})", query, limit);

        String lowerQuery = query.toLowerCase();
        return comicBookRepository.findAll().stream()
                .filter(comic ->
                        comic.getTitle() != null && comic.getTitle().toLowerCase().contains(lowerQuery) ||
                                comic.getSeries().getName().toLowerCase().contains(lowerQuery) ||
                                comic.getIssueNumber().toLowerCase().contains(lowerQuery)
                )
                .limit(limit)
                .collect(Collectors.toList());
    }

    // Batch operations with cache management
    @CacheEvict(value = {"all-comic-books", "comic-books-by-series", "key-issues", "comic-book-stats"}, allEntries = true)
    public List<ComicBook> createComicBooksFromComicVine(Long seriesId, List<String> comicVineIssueIds) {
        log.info("Creating comic books from Comic Vine for series ID: {}", seriesId);

        Optional<Series> series = seriesRepository.findById(seriesId);
        if (series.isEmpty()) {
            throw new IllegalArgumentException("Series with ID " + seriesId + " not found");
        }

        if (series.get().getComicVineId() == null) {
            throw new IllegalArgumentException("Series does not have a Comic Vine ID");
        }

        List<ComicVineService.ComicVineIssueDto> comicVineIssues = comicVineService.searchIssues(series.get().getComicVineId());

        return comicVineIssueIds.stream()
                .map(issueId -> comicVineIssues.stream()
                        .filter(issue -> issue.getId().equals(issueId))
                        .findFirst()
                        .orElse(null))
                .filter(Objects::nonNull)
                .map(issue -> createComicBookFromComicVineIssue(issue, series.get()))
                .collect(Collectors.toList());
    }

    // Clear all comic book related caches
    @CacheEvict(value = {"comic-book", "all-comic-books", "comic-books-by-series", "key-issues",
            "comic-book-stats", "recent-comic-books", "comic-book-search",
            "comic-vine-issues-by-series"}, allEntries = true)
    public void clearAllComicBookCaches() {
        log.info("Cleared all comic book caches");
    }

    // Private helper methods
    private void mapRequestToComicBook(ComicBookRequest request, ComicBook comicBook) {
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
    }

    private void copyComicBook(ComicBook source, ComicBook target) {
        target.setId(source.getId());
        target.setIssueNumber(source.getIssueNumber());
        target.setTitle(source.getTitle());
        target.setDescription(source.getDescription());
        target.setCoverDate(source.getCoverDate());
        target.setImageUrl(source.getImageUrl());
        target.setCondition(source.getCondition());
        target.setPurchasePrice(source.getPurchasePrice());
        target.setCurrentValue(source.getCurrentValue());
        target.setPurchaseDate(source.getPurchaseDate());
        target.setNotes(source.getNotes());
        target.setComicVineId(source.getComicVineId());
        target.setIsKeyIssue(source.getIsKeyIssue());
        target.setSeries(source.getSeries());
    }

    private ComicBook createComicBookFromComicVineIssue(ComicVineService.ComicVineIssueDto issue, Series series) {
        ComicBook comicBook = new ComicBook();
        comicBook.setIssueNumber(issue.getIssueNumber());
        comicBook.setTitle(issue.getName());
        comicBook.setDescription(issue.getDescription());
        comicBook.setImageUrl(issue.getImageUrl());
        comicBook.setComicVineId(issue.getId());
        comicBook.setSeries(series);

        // Parse cover date if available
        if (issue.getCoverDate() != null && !issue.getCoverDate().isEmpty()) {
            try {
                comicBook.setCoverDate(java.time.LocalDate.parse(issue.getCoverDate()));
            } catch (Exception e) {
                log.warn("Could not parse cover date: {}", issue.getCoverDate());
            }
        }

        return comicBookRepository.save(comicBook);
    }

    // Base request interface
    public interface ComicBookRequest {
        String getIssueNumber();
        String getTitle();
        String getDescription();
        java.time.LocalDate getCoverDate();
        String getImageUrl();
        ComicBook.Condition getCondition();
        java.math.BigDecimal getPurchasePrice();
        java.math.BigDecimal getCurrentValue();
        java.time.LocalDate getPurchaseDate();
        String getNotes();
        String getComicVineId();
        Boolean getIsKeyIssue();
    }

    // Create request with series ID
    public interface ComicBookCreateRequest extends ComicBookRequest {
        Long getSeriesId();
    }

    // Update request without series ID (series cannot be changed)
    public interface ComicBookUpdateRequest extends ComicBookRequest {
    }
}