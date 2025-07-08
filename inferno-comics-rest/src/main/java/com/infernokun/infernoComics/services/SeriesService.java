package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.DescriptionGenerated;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional
public class SeriesService {

    private final SeriesRepository seriesRepository;
    private final ComicVineService comicVineService;
    private final DescriptionGeneratorService descriptionGeneratorService;
    private final GCDatabaseService gcDatabaseService;
    private final WebClient webClient;

    public SeriesService(SeriesRepository seriesRepository,
                         ComicVineService comicVineService,
                         DescriptionGeneratorService descriptionGeneratorService, GCDatabaseService gcDatabaseService, InfernoComicsConfig infernoComicsConfig) {
        this.seriesRepository = seriesRepository;
        this.comicVineService = comicVineService;
        this.descriptionGeneratorService = descriptionGeneratorService;
        this.gcDatabaseService = gcDatabaseService;
        this.webClient = WebClient.builder()
                .baseUrl("http://" + infernoComicsConfig.getRecognitionServerHost() + ":" + infernoComicsConfig.getRecognitionServerPort() + "/inferno-comics-recognition/api/v1")
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(1024 * 1024))
                        .build())
                .build();
    }

    @Cacheable(value = "all-series")
    public List<Series> getAllSeries() {
        log.info("Fetching all series from database");
        return seriesRepository.findAll();
    }

    @Cacheable(value = "series", key = "#id")
    @Transactional(readOnly = true)
    public Optional<Series> getSeriesById(Long id) {
        log.info("Fetching series with ID: {}", id);
        return seriesRepository.findByIdWithComicBooks(id);
    }

    // Cache series search results
    @Cacheable(value = "series-search", key = "#query")
    public List<Series> searchSeries(String query) {
        log.info("Searching series with query: {}", query);
        return seriesRepository.findByNameContainingIgnoreCaseOrPublisherContainingIgnoreCase(query, query);
    }

    // Cache Comic Vine series search
    @Cacheable(value = "comic-vine-series-search", key = "#query")
    public List<ComicVineService.ComicVineSeriesDto> searchComicVineSeries(String query) {
        log.info("Searching Comic Vine series with query: {}", query);
        try {
            return comicVineService.searchSeries(query);
        } catch (Exception e) {
            log.error("Error searching Comic Vine series: {}", e.getMessage());
            return List.of();
        }
    }

    // Cache Comic Vine issues search
    @Cacheable(value = "comic-vine-issues-search", key = "#seriesId")
    public List<ComicVineService.ComicVineIssueDto> searchComicVineIssues(Long seriesId) {
        log.info("Searching Comic Vine issues for series ID: {}", seriesId);
        try {
            Optional<Series> series = seriesRepository.findById(seriesId);
            if (series.isPresent() && series.get().getComicVineId() != null) {
                return comicVineService.searchIssues(series.get().getComicVineId());
            }
            log.warn("Series {} not found or has no Comic Vine ID", seriesId);
            return List.of();
        } catch (Exception e) {
            log.error("Error searching Comic Vine issues for series {}: {}", seriesId, e.getMessage());
            return List.of();
        }
    }

    // Create series and invalidate relevant caches
    @CacheEvict(value = {"all-series", "series-stats", "recent-series"}, allEntries = true)
    public Series createSeries(SeriesCreateRequest request) {
        log.info("Creating series: {}", request.getName());

        Series series = new Series();
        mapRequestToSeries(request, series);

        // Generate description if not provided
        if (request.getDescription() == null || request.getDescription().trim().isEmpty()) {
            DescriptionGenerated generatedDescription = descriptionGeneratorService.generateDescription(
                    request.getName(),
                    "Series",
                    request.getPublisher(),
                    request.getStartYear() != null ? request.getStartYear().toString() : null,
                    request.getDescription()
            );
            series.setDescription(generatedDescription.getDescription());
            series.setGeneratedDescription(generatedDescription.isGenerated());
        }

        Series savedSeries = seriesRepository.save(series);
        log.info("Created series with ID: {}", savedSeries.getId());
        return savedSeries;
    }

    // Update series and refresh cache
    @CachePut(value = "series", key = "#id")
    @CacheEvict(value = {"all-series", "series-search", "series-stats", "recent-series"}, allEntries = true)
    public Series updateSeries(Long id, SeriesUpdateRequest request) {
        log.info("Updating series with ID: {}", id);

        Optional<Series> optionalSeries = seriesRepository.findById(id);
        if (optionalSeries.isEmpty()) {
            throw new IllegalArgumentException("Series with ID " + id + " not found");
        }

        Series series = optionalSeries.get();
        mapRequestToSeries(request, series);

        Series updatedSeries = seriesRepository.save(series);

        // Evict description cache if series details changed
        descriptionGeneratorService.evictSeriesCache(updatedSeries);

        log.info("Updated series: {}", series.getName());
        return updatedSeries;
    }

    // Delete series and invalidate caches
    @CacheEvict(value = {"series", "all-series", "series-search", "series-stats", "recent-series"}, allEntries = true)
    public void deleteSeries(Long id) {
        log.info("Deleting series with ID: {}", id);

        if (!seriesRepository.existsById(id)) {
            throw new IllegalArgumentException("Series with ID " + id + " not found");
        }

        // Get series for cache eviction before deletion
        Optional<Series> series = seriesRepository.findById(id);
        series.ifPresent(descriptionGeneratorService::evictSeriesCache);

        seriesRepository.deleteById(id);
        log.info("Deleted series with ID: {}", id);
    }

    // Cache series statistics
    @Cacheable(value = "series-stats")
    public Map<String, Object> getSeriesStats() {
        log.info("Calculating series statistics");

        List<Series> allSeries = seriesRepository.findAll();

        long totalSeries = allSeries.size();

        Map<String, Long> publisherCounts = allSeries.stream()
                .filter(series -> series.getPublisher() != null)
                .collect(Collectors.groupingBy(
                        Series::getPublisher,
                        Collectors.counting()
                ));

        Map<String, Long> decadeCounts = allSeries.stream()
                .filter(series -> series.getStartYear() != null)
                .collect(Collectors.groupingBy(
                        series -> (series.getStartYear() / 10) * 10 + "s",
                        Collectors.counting()
                ));

        long seriesWithComicVineId = allSeries.stream()
                .mapToLong(series -> series.getComicVineId() != null ? 1 : 0)
                .sum();

        return Map.of(
                "totalSeries", totalSeries,
                "publisherBreakdown", publisherCounts,
                "decadeBreakdown", decadeCounts,
                "seriesWithComicVineId", seriesWithComicVineId
        );
    }

    // Cache recent series
    @Cacheable(value = "recent-series", key = "#limit")
    public List<Series> getRecentSeries(int limit) {
        log.info("Fetching {} recent series", limit);
        return seriesRepository.findRecentSeries(limit);
    }

    // Advanced series search with caching
    @Cacheable(value = "series-advanced-search", key = "#publisher + ':' + #startYear + ':' + #endYear")
    public List<Series> searchSeriesByPublisherAndYear(String publisher, Integer startYear, Integer endYear) {
        log.info("Advanced search - Publisher: {}, Start Year: {}, End Year: {}", publisher, startYear, endYear);

        return seriesRepository.findAll().stream()
                .filter(series -> {
                    if (publisher != null && !publisher.isEmpty()) {
                        return series.getPublisher() != null &&
                                series.getPublisher().toLowerCase().contains(publisher.toLowerCase());
                    }
                    return true;
                })
                .filter(series -> {
                    if (startYear != null) {
                        return series.getStartYear() != null && series.getStartYear() >= startYear;
                    }
                    return true;
                })
                .filter(series -> {
                    if (endYear != null) {
                        return series.getStartYear() != null && series.getStartYear() <= endYear;
                    }
                    return true;
                })
                .collect(Collectors.toList());
    }

    // Create series from Comic Vine data
    @CacheEvict(value = {"all-series", "series-stats", "recent-series"}, allEntries = true)
    public Series createSeriesFromComicVine(String comicVineId, ComicVineService.ComicVineSeriesDto comicVineData) {
        log.info("Creating series from Comic Vine data: {}", comicVineData.getName());

        Series series = new Series();
        series.setName(comicVineData.getName());
        series.setDescription(comicVineData.getDescription());
        series.setPublisher(comicVineData.getPublisher());
        series.setStartYear(comicVineData.getStartYear());
        series.setImageUrl(comicVineData.getImageUrl());
        series.setComicVineId(comicVineId);

        // Generate description if Comic Vine description is empty
        if (series.getDescription() == null || series.getDescription().trim().isEmpty()) {
            DescriptionGenerated generatedDescription = descriptionGeneratorService.generateDescription(
                    series.getName(),
                    "Series",
                    series.getPublisher(),
                    series.getStartYear() != null ? series.getStartYear().toString() : null,
                    series.getDescription()
            );
            series.setDescription(generatedDescription.getDescription());
            series.setGeneratedDescription(generatedDescription.isGenerated());
        }

        Series savedSeries = seriesRepository.save(series);
        log.info("Created series from Comic Vine with ID: {}", savedSeries.getId());
        return savedSeries;
    }

    // Batch import series with cache management
    @CacheEvict(value = {"all-series", "series-stats", "recent-series"}, allEntries = true)
    public List<Series> createMultipleSeriesFromComicVine(List<ComicVineService.ComicVineSeriesDto> comicVineSeriesList) {
        log.info("Batch creating {} series from Comic Vine data", comicVineSeriesList.size());

        return comicVineSeriesList.stream()
                .map(comicVineData -> createSeriesFromComicVine(comicVineData.getId(), comicVineData))
                .collect(Collectors.toList());
    }

    // Force refresh Comic Vine search cache
    @CacheEvict(value = {"comic-vine-series-search", "comic-vine-issues-search"}, allEntries = true)
    public void refreshComicVineCache() {
        log.info("Refreshed Comic Vine search caches");
    }

    // Clear all series related caches
    @CacheEvict(value = {"series", "all-series", "series-search", "series-stats", "recent-series",
            "series-advanced-search", "comic-vine-series-search", "comic-vine-issues-search"},
            allEntries = true)
    public void clearAllSeriesCaches() {
        log.info("Cleared all series caches");
    }

    // Get popular series (most comic books)
    @Cacheable(value = "popular-series", key = "#limit")
    public List<Series> getPopularSeries(int limit) {
        log.info("Fetching {} popular series", limit);

        return seriesRepository.findAll().stream()
                .sorted((s1, s2) -> Integer.compare(s2.getComicBooks().size(), s1.getComicBooks().size()))
                .limit(limit)
                .collect(Collectors.toList());
    }

    public JsonNode addComicByImage(Long seriesId, MultipartFile imageFile) {
        Optional<Series> series = seriesRepository.findById(seriesId);
        if (series.isEmpty()) {
            throw new IllegalArgumentException("Series not found with id: " + seriesId);
        }

        Series seriesEntity = series.get();
        List<ComicVineService.ComicVineIssueDto> results = searchComicVineIssues(seriesId);

        // Batch fetch variants for all issues
        List<String> issueNumbers = results.stream()
                .map(ComicVineService.ComicVineIssueDto::getIssueNumber)
                .collect(Collectors.toList());

        Map<String, List<String>> variantMap = gcDatabaseService.getVariantCoversForMultipleIssues(
                seriesEntity.getName(),
                seriesEntity.getPublisher(),
                seriesEntity.getStartYear().toString(),
                issueNumbers
        );

        // Enhance results with variants
        List<ComicVineService.ComicVineIssueDto> enhancedResults = results.stream()
                .peek(issue -> {
                    List<String> variants = variantMap.getOrDefault(issue.getIssueNumber(), Collections.emptyList());
                    issue.setVariants(variants);
                })
                .toList();

        List<String> candidateUrls = enhancedResults.stream()
                .map(ComicVineService.ComicVineIssueDto::getImageUrl)
                .toList();

        // Add variant URLs to candidate URLs for matching
        List<String> variantUrls = enhancedResults.stream()
                .filter(issue -> issue.getVariants() != null)
                .flatMap(issue -> issue.getVariants().stream())
                .toList();

        List<String> allCandidateUrls = new ArrayList<>(candidateUrls);
        allCandidateUrls.addAll(variantUrls);

        try {
            MultipartBodyBuilder builder = new MultipartBodyBuilder();

            builder.part("image", imageFile.getResource())
                    .contentType(MediaType.valueOf(Objects.requireNonNull(imageFile.getContentType())));

            for (String url : allCandidateUrls) {
                builder.part("candidate_urls", url);
            }

            String response = webClient.post()
                    .uri("/image-matcher")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(response);

            return root.get("top_matches");
        } catch (Exception e) {
            throw new RuntimeException("Failed to send image to matcher service", e);
        }
    }

    // Private helper methods
    private void mapRequestToSeries(SeriesRequest request, Series series) {
        series.setName(request.getName());
        series.setDescription(request.getDescription());
        series.setPublisher(request.getPublisher());
        series.setStartYear(request.getStartYear());
        series.setEndYear(request.getEndYear());
        series.setImageUrl(request.getImageUrl());
        series.setComicVineId(request.getComicVineId());
    }

    // Base request interface
    public interface SeriesRequest {
        String getName();
        String getDescription();
        String getPublisher();
        Integer getStartYear();
        Integer getEndYear();
        String getImageUrl();
        String getComicVineId();
    }

    // Create request
    public interface SeriesCreateRequest extends SeriesRequest {
    }

    // Update request
    public interface SeriesUpdateRequest extends SeriesRequest {
    }
}