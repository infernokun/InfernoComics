package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.controllers.SeriesController;
import com.infernokun.infernoComics.models.DescriptionGenerated;
import com.infernokun.infernoComics.models.ProgressUpdateRequest;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.gcd.GCDCover;
import com.infernokun.infernoComics.models.gcd.GCDSeries;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.services.gcd.GCDatabaseService;
import lombok.extern.slf4j.Slf4j;
import org.modelmapper.ModelMapper;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.CacheManager;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional
public class SeriesService {
    private final SeriesRepository seriesRepository;
    private final IssueService issueService;
    private final ComicVineService comicVineService;
    private final DescriptionGeneratorService descriptionGeneratorService;
    private final GCDatabaseService gcDatabaseService;
    private final ModelMapper modelMapper;
    private final ProgressService progressService;
    private final CacheManager cacheManager;

    private final WebClient webClient;

    private final Map<Integer, List<GCDCover>> urlCache = new HashMap<>();

    public SeriesService(SeriesRepository seriesRepository, IssueService issueService,
                         ComicVineService comicVineService,
                         DescriptionGeneratorService descriptionGeneratorService,
                         GCDatabaseService gcDatabaseService,
                         ModelMapper modelMapper,
                         InfernoComicsConfig infernoComicsConfig,
                         ProgressService progressService,
                         CacheManager cacheManager) {
        this.seriesRepository = seriesRepository;
        this.issueService = issueService;
        this.comicVineService = comicVineService;
        this.descriptionGeneratorService = descriptionGeneratorService;
        this.gcDatabaseService = gcDatabaseService;
        this.modelMapper = modelMapper;
        this.progressService = progressService;
        this.cacheManager = cacheManager;
        urlCache.put(0, new ArrayList<>());
        this.webClient = WebClient.builder()
                .baseUrl("http://" + infernoComicsConfig.getRecognitionServerHost() + ":" + infernoComicsConfig.getRecognitionServerPort() + "/inferno-comics-recognition/api/v1")
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(500 * 1024 * 1024))
                        .build())
                .build();
    }

    public List<Series> getAllSeries() {
        log.info("Fetching all series from database");

        // Try to get from cache first
        String cacheKey = "all-series-with-counts";
        List<Series> cachedSeries = getCachedValue("series-list", cacheKey);

        if (cachedSeries != null) {
            log.info("Returning cached series list with {} items", cachedSeries.size());
            return cachedSeries;
        }

        // Fetch from database and compute issue counts
        List<Series> seriesList = seriesRepository.findAll();
        seriesList.forEach(series ->
                series.setIssueCount(issueService.getIssuesBySeriesId(series.getId()).size()));

        // Cache the result for 30 minutes
        putCacheValue("series-list", cacheKey, seriesList);

        return seriesList;
    }

    @Cacheable(value = "series", key = "#id", unless = "#result == null")
    @Transactional(readOnly = true)
    public Series getSeriesById(Long id) {
        log.info("Fetching series with ID: {}", id);
        return seriesRepository.findByIdWithIssues(id).orElse(null);
    }

    public ComicVineService.ComicVineSeriesDto getComicVineSeriesById(Long comicVineId) {
        log.debug("Fetching Comic Vine series with ID: {}", comicVineId);
        return comicVineService.getComicVineSeriesById(comicVineId);
    }

    @Cacheable(value = "series-search", key = "#query", unless = "#result.isEmpty()")
    public List<Series> searchSeries(String query) {
        log.info("Searching series with query: {}", query);
        return seriesRepository.findByNameContainingIgnoreCaseOrPublisherContainingIgnoreCase(query, query);
    }

    @Cacheable(value = "comic-vine-series", key = "#query", unless = "#result.isEmpty()")
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
    @Cacheable(value = "comic-vine-issues", key = "#seriesId", unless = "#result.isEmpty()")
    public List<ComicVineService.ComicVineIssueDto> searchComicVineIssues(Long seriesId) {
        log.info("Searching Comic Vine issues for series ID: {}", seriesId);
        try {
            Optional<Series> series = seriesRepository.findById(seriesId);
            if (series.isPresent() && series.get().getComicVineId() != null) {
                return comicVineService.searchIssues(series.get());
            }
            log.warn("Series {} not found or has no Comic Vine ID", seriesId);
            return List.of();
        } catch (Exception e) {
            log.error("Error searching Comic Vine issues for series {}: {}", seriesId, e.getMessage());
            return List.of();
        }
    }

    @Transactional
    public Series createSeries(SeriesController.SeriesCreateRequestDto request) {
        log.info("Creating series: {}", request.getName());

        Series series = this.modelMapper.map(request, Series.class);

        // Generate description if not provided
        if (request.getDescription() == null || request.getDescription().trim().isEmpty()) {
            try {
                DescriptionGenerated generatedDescription = descriptionGeneratorService.generateDescription(
                        request.getName(),
                        "Series",
                        request.getPublisher(),
                        request.getStartYear() != null ? request.getStartYear().toString() : null,
                        request.getDescription()
                );
                series.setDescription(generatedDescription.getDescription());
                series.setGeneratedDescription(generatedDescription.isGenerated());
            } catch (Exception e) {
                log.warn("Failed to generate description for '{}': {}", request.getName(), e.getMessage());
                series.setDescription("");
                series.setGeneratedDescription(false);
            }
        }

        // Process Comic Vine IDs
        List<String> gcdIds = new ArrayList<>();
        if (request.getComicVineIds() != null) {
            for (String comicVineId : request.getComicVineIds()) {
                try {
                    ComicVineService.ComicVineSeriesDto dto = comicVineService.getComicVineSeriesById(Long.valueOf(comicVineId));
                    if (dto != null) {
                        Optional<GCDSeries> gcdSeriesOptional = gcDatabaseService
                                .findGCDSeriesWithComicVineSeries(dto.getName(), dto.getStartYear(), dto.getIssueCount());
                        if (gcdSeriesOptional.isPresent()) {
                            gcdIds.add(String.valueOf(gcdSeriesOptional.get().getId()));
                            log.debug("Mapped Comic Vine ID {} to GCD ID {}", comicVineId, gcdSeriesOptional.get().getId());
                        } else {
                            log.warn("No GCD mapping found for Comic Vine ID: {}", comicVineId);
                        }
                    }
                } catch (Exception e) {
                    log.error("Error processing Comic Vine ID {}: {}", comicVineId, e.getMessage());
                }
            }
        }

        series.setGcdIds(gcdIds);
        Series savedSeries = seriesRepository.save(series);

        // Only evict caches that are directly affected
        evictListCaches();

        log.info("Created series with ID: {} (mapped {} GCD IDs)", savedSeries.getId(), gcdIds.size());
        return savedSeries;
    }

    @CachePut(value = "series", key = "#id", condition = "#result != null")
    @Transactional
    public Series updateSeries(Long id, SeriesUpdateRequest request) {
        log.info("Updating series with ID: {}", id);

        try {
            Series existingSeries = seriesRepository.findById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Series with ID " + id + " not found"));

            List<String> originalComicVineIds = new ArrayList<>(existingSeries.getComicVineIds() != null ?
                    existingSeries.getComicVineIds() : List.of());
            List<String> originalGcdIds = new ArrayList<>(existingSeries.getGcdIds() != null ?
                    existingSeries.getGcdIds() : List.of());

            log.info("Original Comic Vine IDs: {}", originalComicVineIds);
            log.info("Original GCD IDs: {}", originalGcdIds);

            existingSeries.setName(request.getName());
            existingSeries.setDescription(request.getDescription());
            existingSeries.setPublisher(request.getPublisher());
            existingSeries.setStartYear(request.getStartYear());
            existingSeries.setEndYear(request.getEndYear());
            existingSeries.setImageUrl(request.getImageUrl());

            if (request instanceof SeriesController.SeriesUpdateRequestDto) {
                SeriesController.SeriesUpdateRequestDto dto = (SeriesController.SeriesUpdateRequestDto) request;

                List<String> requestComicVineIds = dto.getComicVineIds() != null ?
                        new ArrayList<>(dto.getComicVineIds()) : new ArrayList<>();

                log.info("Request Comic Vine IDs: {}", requestComicVineIds);

                existingSeries.setComicVineIds(new ArrayList<>(requestComicVineIds));

                if (dto.getComicVineId() != null) {
                    existingSeries.setComicVineId(dto.getComicVineId());
                }
            }

            List<String> newComicVineIds = existingSeries.getComicVineIds() != null ?
                    new ArrayList<>(existingSeries.getComicVineIds()) : new ArrayList<>();

            log.info("New Comic Vine IDs after manual mapping: {}", newComicVineIds);

            if (newComicVineIds.isEmpty()) {
                log.info("No Comic Vine IDs remaining, clearing primary Comic Vine ID");
                existingSeries.setComicVineId(null);
            } else if (existingSeries.getComicVineId() == null || !newComicVineIds.contains(existingSeries.getComicVineId())) {
                String newPrimary = newComicVineIds.get(0);
                log.info("Updating primary Comic Vine ID from {} to {}", existingSeries.getComicVineId(), newPrimary);
                existingSeries.setComicVineId(newPrimary);
            }

            // ALWAYS update GCD mappings when Comic Vine IDs change
            if (!originalComicVineIds.equals(newComicVineIds)) {
                log.info("Comic Vine IDs changed for series {}: {} -> {}", id, originalComicVineIds, newComicVineIds);

                if (newComicVineIds.isEmpty()) {
                    // If no Comic Vine IDs left, clear GCD mappings
                    log.info("No Comic Vine IDs remaining, clearing GCD mappings for series {}", id);
                    existingSeries.setGcdIds(new ArrayList<>());
                } else {
                    // Update GCD mappings for remaining Comic Vine IDs
                    log.info("Updating GCD mappings for {} remaining Comic Vine IDs", newComicVineIds.size());
                    updateGcdMappings(existingSeries, newComicVineIds);
                }

                // Recalculate metadata if we have Comic Vine associations
                if (!newComicVineIds.isEmpty()) {
                    log.info("Recalculating metadata for {} Comic Vine IDs", newComicVineIds.size());
                    recalculateSeriesMetadataFromComicVine(existingSeries, newComicVineIds);
                }
            } else {
                log.info("Comic Vine IDs unchanged, skipping GCD mapping update");
            }

            log.info("Before save - Comic Vine IDs: {}, GCD IDs: {}",
                    existingSeries.getComicVineIds(), existingSeries.getGcdIds());

            // Save the updated series
            Series updatedSeries = seriesRepository.save(existingSeries);

            log.info("After save - Comic Vine IDs: {}, GCD IDs: {}",
                    updatedSeries.getComicVineIds(), updatedSeries.getGcdIds());

            evictListCaches();
            descriptionGeneratorService.evictSeriesCache(updatedSeries);

            if (!originalComicVineIds.equals(newComicVineIds)) {
                evictCacheValue("comic-vine-issues", id.toString());
            }

            log.info("Successfully updated series: {} (Comic Vine IDs: {}, GCD IDs: {})",
                    updatedSeries.getName(), updatedSeries.getComicVineIds(), updatedSeries.getGcdIds());

            return updatedSeries;

        } catch (Exception e) {
            log.error("Error updating series {}: {}", id, e.getMessage(), e);
            throw e;
        }
    }

    private void updateGcdMappings(Series series, List<String> comicVineIds) {
        try {
            // Create a completely NEW list to avoid any reference issues
            List<String> newGcdIds = new ArrayList<>();

            for (String comicVineId : comicVineIds) {
                try {
                    log.info("Processing Comic Vine ID: {}", comicVineId);

                    ComicVineService.ComicVineSeriesDto dto = comicVineService.getComicVineSeriesById(Long.valueOf(comicVineId));

                    if (dto != null) {
                        log.info("Found Comic Vine data: name='{}', startYear={}, issueCount={}",
                                dto.getName(), dto.getStartYear(), dto.getIssueCount());

                        Optional<GCDSeries> gcdSeriesOptional = gcDatabaseService
                                .findGCDSeriesWithComicVineSeries(dto.getName(), dto.getStartYear(), dto.getIssueCount());

                        if (gcdSeriesOptional.isPresent()) {
                            String gcdId = String.valueOf(gcdSeriesOptional.get().getId());
                            newGcdIds.add(gcdId);
                            log.info("✅ Mapped Comic Vine ID {} to GCD ID {}", comicVineId, gcdId);
                        } else {
                            log.warn("❌ No GCD mapping found for Comic Vine ID: {}", comicVineId);
                        }
                    } else {
                        log.warn("❌ No Comic Vine data found for ID: {}", comicVineId);
                    }
                } catch (Exception e) {
                    log.error("❌ Error processing Comic Vine ID {}: {}", comicVineId, e.getMessage());
                    // Continue with other IDs even if one fails
                }
            }

            log.info("New GCD IDs calculated: {}", newGcdIds);

            series.setGcdIds(new ArrayList<>(newGcdIds));
        } catch (Exception e) {
            log.error("❌ Error updating GCD mappings for series {}: {}", series.getId(), e.getMessage(), e);
        }
    }

    // Fixed recalculate method using your correct method name
    private void recalculateSeriesMetadataFromComicVine(Series series, List<String> comicVineIds) {
        try {
            List<ComicVineService.ComicVineSeriesDto> comicVineData = new ArrayList<>();

            for (String comicVineId : comicVineIds) {
                try {
                    log.info("Fetching metadata for Comic Vine ID: {}", comicVineId);

                    // Use your renamed method
                    ComicVineService.ComicVineSeriesDto dto = comicVineService.getComicVineSeriesById(Long.valueOf(comicVineId));

                    if (dto != null) {
                        comicVineData.add(dto);
                        log.info("✅ Got metadata: name='{}', startYear={}, endYear={}, issueCount={}",
                                dto.getName(), dto.getStartYear(), dto.getEndYear(), dto.getIssueCount());
                    } else {
                        log.warn("❌ No Comic Vine data found for ID: {}", comicVineId);
                    }
                } catch (Exception e) {
                    log.error("❌ Error processing Comic Vine ID {}: {}", comicVineId, e.getMessage());
                }
            }

            if (comicVineData.isEmpty()) {
                log.warn("No valid Comic Vine data found for metadata recalculation for series {}", series.getId());
                return;
            }

            log.info("Successfully fetched {} Comic Vine series data objects", comicVineData.size());

            // Recalculate date range
            List<Integer> startYears = comicVineData.stream()
                    .map(ComicVineService.ComicVineSeriesDto::getStartYear)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());

            List<Integer> endYears = comicVineData.stream()
                    .map(ComicVineService.ComicVineSeriesDto::getEndYear)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());

            if (!startYears.isEmpty()) {
                Integer earliestStart = Collections.min(startYears);
                if (!earliestStart.equals(series.getStartYear())) {
                    log.info("Updating start year from {} to {}", series.getStartYear(), earliestStart);
                    series.setStartYear(earliestStart);
                }
            }

            if (!endYears.isEmpty()) {
                Integer latestEnd = Collections.max(endYears);
                if (!latestEnd.equals(series.getEndYear())) {
                    log.info("Updating end year from {} to {}", series.getEndYear(), latestEnd);
                    series.setEndYear(latestEnd);
                }
            }

            // Recalculate total issue count
            int totalIssueCount = comicVineData.stream()
                    .mapToInt(data -> data.getIssueCount() != null ? data.getIssueCount() : 0)
                    .sum();

            if (totalIssueCount != series.getIssueCount()) {
                log.info("Updating issue count from {} to {}", series.getIssueCount(), totalIssueCount);
                series.setIssueCount(totalIssueCount);
            }
        } catch (Exception e) {
            log.error("❌ Error recalculating series metadata from Comic Vine for series {}: {}", series.getId(), e.getMessage(), e);
        }
    }

    @CacheEvict(value = "series", key = "#id")
    @Transactional
    public void deleteSeries(Long id) {
        log.info("Deleting series with ID: {}", id);

        if (!seriesRepository.existsById(id)) {
            throw new IllegalArgumentException("Series with ID " + id + " not found");
        }

        // Get series for cache eviction before deletion
        Optional<Series> series = seriesRepository.findById(id);
        series.ifPresent(descriptionGeneratorService::evictSeriesCache);

        seriesRepository.deleteById(id);

        // Evict list caches since a series was deleted
        evictListCaches();

        log.info("Deleted series with ID: {}", id);
    }

    // Cache series statistics with proper TTL
    @Cacheable(value = "series-stats", key = "'global'")
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
    @Cacheable(value = "series-advanced-search",
            key = "T(java.util.Objects).hash(#publisher, #startYear, #endYear)")
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

        // Evict list caches since new series was added
        evictListCaches();

        log.info("Created series from Comic Vine with ID: {}", savedSeries.getId());
        return savedSeries;
    }

    // Batch import series with cache management
    @Transactional
    public List<Series> createMultipleSeriesFromComicVine(List<ComicVineService.ComicVineSeriesDto> comicVineSeriesList) {
        log.info("Batch creating {} series from Comic Vine data", comicVineSeriesList.size());

        List<Series> createdSeries = comicVineSeriesList.stream()
                .map(comicVineData -> {
                    // Don't call createSeriesFromComicVine to avoid multiple cache evictions
                    Series series = new Series();
                    series.setName(comicVineData.getName());
                    series.setDescription(comicVineData.getDescription());
                    series.setPublisher(comicVineData.getPublisher());
                    series.setStartYear(comicVineData.getStartYear());
                    series.setImageUrl(comicVineData.getImageUrl());
                    series.setComicVineId(comicVineData.getId());

                    return seriesRepository.save(series);
                })
                .collect(Collectors.toList());

        // Single cache eviction after all series are created
        evictListCaches();

        return createdSeries;
    }

    // Cache management methods
    @CacheEvict(value = {"comic-vine-series", "comic-vine-issues"}, allEntries = true)
    public void refreshComicVineCache() {
        log.info("Refreshed Comic Vine search caches");
    }

    public void clearAllSeriesCaches() {
        log.info("Clearing all series caches");

        // Clear specific cache regions
        Arrays.asList("series", "series-list", "series-search", "series-stats",
                "recent-series", "series-advanced-search", "comic-vine-series",
                "comic-vine-issues").forEach(cacheName -> {
            try {
                Objects.requireNonNull(cacheManager.getCache(cacheName)).clear();
                log.debug("Cleared cache: {}", cacheName);
            } catch (Exception e) {
                log.warn("Failed to clear cache {}: {}", cacheName, e.getMessage());
            }
        });
    }

    // Get popular series (most comic books)
    @Cacheable(value = "popular-series", key = "#limit")
    public List<Series> getPopularSeries(int limit) {
        log.info("Fetching {} popular series", limit);

        return seriesRepository.findAll().stream()
                .sorted((s1, s2) -> Integer.compare(s2.getIssues().size(), s1.getIssues().size()))
                .limit(limit)
                .collect(Collectors.toList());
    }

    // Helper method to evict list-based caches when series data changes
    private void evictListCaches() {
        Arrays.asList("series-list", "recent-series", "popular-series", "series-stats")
                .forEach(cacheName -> {
                    try {
                        Objects.requireNonNull(cacheManager.getCache(cacheName)).clear();
                        log.debug("Evicted cache: {}", cacheName);
                    } catch (Exception e) {
                        log.warn("Failed to evict cache {}: {}", cacheName, e.getMessage());
                    }
                });
    }

    // Helper method to get cached values
    @SuppressWarnings("unchecked")
    private <T> T getCachedValue(String cacheName, String key) {
        try {
            var cache = cacheManager.getCache(cacheName);
            if (cache != null) {
                var wrapper = cache.get(key);
                if (wrapper != null) {
                    return (T) wrapper.get();
                }
            }
        } catch (Exception e) {
            log.warn("Failed to get cached value from {} with key {}: {}", cacheName, key, e.getMessage());
        }
        return null;
    }

    // Helper method to put cached values
    private void putCacheValue(String cacheName, String key, Object value) {
        try {
            var cache = cacheManager.getCache(cacheName);
            if (cache != null) {
                cache.put(key, value);
            }
        } catch (Exception e) {
            log.warn("Failed to cache value in {} with key {}: {}", cacheName, key, e.getMessage());
        }
    }

    // Helper method to evict specific cache entries
    private void evictCacheValue(String cacheName, String key) {
        try {
            var cache = cacheManager.getCache(cacheName);
            if (cache != null) {
                cache.evict(key);
                log.debug("Evicted cache entry: {} - {}", cacheName, key);
            }
        } catch (Exception e) {
            log.warn("Failed to evict cache entry {} from {}: {}", key, cacheName, e.getMessage());
        }
    }

    @Async("imageProcessingExecutor")
    public CompletableFuture<Void> startMultipleImagesProcessingWithProgress(String sessionId, Long seriesId, List<SeriesController.ImageData> imageDataList, String name, int year) {
        log.info("🚀 Starting SSE multiple images processing session: {} for series ID: {} with {} images",
                sessionId, seriesId, imageDataList.size());

        try {
            int timeoutSeconds = 20;
            int intervalMs = 2000;
            int waited = 0;

            while (!progressService.emitterIsPresent(sessionId)) {
                log.warn("Session {} has no emitter yet!", sessionId);
                if (waited >= timeoutSeconds * 1000) {
                    throw new RuntimeException("Timeout: Emitter for sessionId " + sessionId + " not found after " + timeoutSeconds + " seconds.");
                }

                Thread.sleep(intervalMs);
                waited += intervalMs;
            }

            // Stage 1: Series validation (quick)
            progressService.updateProgress(new ProgressUpdateRequest(
                    sessionId, "preparing", 2,
                    String.format("Validating series and %d images...", imageDataList.size())));

            Series seriesEntity = getSeriesById(seriesId); // Use cached method
            if (seriesEntity == null) {
                progressService.sendError(sessionId, "Series not found with id: " + seriesId);
                return CompletableFuture.completedFuture(null);
            }

            log.info("📚 Processing series: '{}' ({}) with {} images",
                    seriesEntity.getName(), seriesEntity.getStartYear(), imageDataList.size());

            List<GCDCover> candidateCovers;

            if (seriesEntity.getCachedCoverUrls() != null && !seriesEntity.getCachedCoverUrls().isEmpty() && seriesEntity.getLastCachedCovers() != null) {
                log.info("Using cached images for session: {}", sessionId);
                progressService.updateProgress(new ProgressUpdateRequest(
                        sessionId, "preparing", 8, "Using cached cover data..."));
                candidateCovers = seriesEntity.getCachedCoverUrls();
            } else {
                // Stage 2: ComicVine search (medium effort)
                progressService.updateProgress(new ProgressUpdateRequest(
                        sessionId, "preparing", 5, "Searching ComicVine database..."));

                log.info("🦸 Starting ComicVine search for series: {} (session: {})", seriesId, sessionId);
                List<ComicVineService.ComicVineIssueDto> results = searchComicVineIssues(seriesId); // Uses cache

                progressService.updateProgress(new ProgressUpdateRequest(
                        sessionId, "preparing", 8,
                        String.format("Found %d ComicVine issues for %d input images",
                                results.size(), imageDataList.size())));
                log.info("🦸 ComicVine completed: Found {} issues (session: {})", results.size(), sessionId);

                candidateCovers = results.stream()
                        .flatMap(issue -> {
                            List<GCDCover> covers = new ArrayList<>();

                            // Main cover from the issue
                            GCDCover mainCover = new GCDCover();
                            mainCover.setName(issue.getName());
                            mainCover.setIssueNumber(issue.getIssueNumber());
                            mainCover.setComicVineId(issue.getId());
                            mainCover.setUrls(Collections.singletonList(issue.getImageUrl()));
                            covers.add(mainCover);

                            // Variant covers from the issue
                            issue.getVariants().forEach(i -> {
                                GCDCover variantCover = new GCDCover();
                                variantCover.setName(issue.getName());
                                variantCover.setIssueNumber(issue.getIssueNumber());
                                variantCover.setComicVineId(i.getId());
                                variantCover.setUrls(Collections.singletonList(i.getOriginalUrl()));
                                variantCover.setParentComicVineId(issue.getId());
                                covers.add(variantCover);
                            });

                            return covers.stream();
                        })
                        .collect(Collectors.toList());

                log.info("Comic vine has {} GCDCovers (session: {})", candidateCovers.size(), sessionId);

                // Cache the covers and update cache
                seriesEntity.setCachedCoverUrls(candidateCovers);
                seriesRepository.save(seriesEntity);

                // Evict the cached series to ensure fresh data
                evictCacheValue("series", seriesId.toString());
            }

            // Stage 3: Hand off to Python for the heavy work (10% -> 100%)
            progressService.updateProgress(new ProgressUpdateRequest(
                    sessionId, "preparing", 10,
                    String.format("Sending %d images with %d candidates to image matcher...",
                            imageDataList.size(), candidateCovers.size())));

            // Let Python handle ALL remaining progress from 10% -> 100%
            JsonNode result = sendMultipleImagesToMatcherWithProgress(sessionId, imageDataList, candidateCovers, seriesEntity);

            log.info("✅ SSE multiple images processing completed for session: {}", sessionId);

            if (result == null) {
                log.warn("⚠️ No result received from Python for session: {}", sessionId);
                progressService.sendError(sessionId, "No results returned from Python image processing");
            }

            log.info("📋 Received result from Python for session: {}, Python controls completion timing", sessionId);

            // Log the result structure for debugging
            log.info("🔍 Result structure for session {}: has results={}, has top_matches={}, has summary={}",
                    sessionId,
                    result != null && result.has("results"),
                    result != null && result.has("top_matches"),
                    result != null && result.has("summary"));

            if (result != null && result.has("results")) {
                JsonNode resultsArray = result.get("results");
                log.info("🔍 Results array size for session {}: {}", sessionId, resultsArray.size());

                // Log first few results for debugging
                for (int i = 0; i < Math.min(3, resultsArray.size()); i++) {
                    JsonNode imageResult = resultsArray.get(i);
                    log.info("🔍 Image result {}: name={}, matches={}",
                            i,
                            imageResult.has("image_name") ? imageResult.get("image_name").asText() : "unknown",
                            imageResult.has("top_matches") ? imageResult.get("top_matches").size() : 0);
                }
            }

        } catch (Exception e) {
            log.error("❌ Error in SSE multiple images processing for session {}: {}", sessionId, e.getMessage());
            progressService.sendError(sessionId, "Error processing images: " + e.getMessage());
        } finally {
            log.info("🔚 Multiple images processing method completed for session: {}", sessionId);
        }

        return CompletableFuture.completedFuture(null);
    }

    private JsonNode sendMultipleImagesToMatcherWithProgress(String sessionId, List<SeriesController.ImageData> imageDataList,
                                                             List<GCDCover> candidateCovers, Series seriesEntity) {
        try {
            log.info("📤 Preparing Flask SSE multiple images matcher request for session: {}...", sessionId);
            log.info("    Images: {} files", imageDataList.size());
            log.info("    ✅ Candidate covers: {}", candidateCovers.size());

            MultipartBodyBuilder builder = new MultipartBodyBuilder();

            // Add all images with indexed names
            for (int i = 0; i < imageDataList.size(); i++) {
                SeriesController.ImageData imageData = imageDataList.get(i);
                builder.part("images[" + i + "]", new ByteArrayResource(imageData.getBytes()) {
                    @Override
                    public String getFilename() {
                        return imageData.getOriginalFilename();
                    }
                }).contentType(MediaType.valueOf(imageData.getContentType() != null ? imageData.getContentType() : "image/jpeg"));
            }

            // Convert GCDCover objects to JSON and send as candidate_covers
            ObjectMapper mapper = new ObjectMapper();
            try {
                String candidateCoversJson = mapper.writeValueAsString(candidateCovers);
                builder.part("candidate_covers", candidateCoversJson);
                log.info("📤 Sending {} candidate covers as JSON (session: {})", candidateCovers.size(), sessionId);
            } catch (JsonProcessingException e) {
                log.error("❌ Failed to serialize candidate covers to JSON: {}", e.getMessage());
                return null;
            }

            // Add session ID so Python can report progress directly
            builder.part("session_id", sessionId);

            // Add metadata for better debugging
            builder.part("series_name", seriesEntity.getName());
            builder.part("series_start_year", seriesEntity.getStartYear().toString());
            builder.part("total_candidates", String.valueOf(candidateCovers.size()));
            builder.part("total_images", String.valueOf(imageDataList.size()));
            builder.part("urls_scraped", "true");

            log.info("📤 Sending request to multiple images matcher service (session: {})...", sessionId);
            long startTime = System.currentTimeMillis();

            // Use different endpoint for multiple images
            String response = webClient.post()
                    .uri("/image-matcher-multiple") // Different endpoint for multiple images
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            long duration = System.currentTimeMillis() - startTime;
            log.info("📥 Multiple images matcher response received in {}ms (session: {})", duration, sessionId);

            JsonNode root = mapper.readTree(response);
            JsonNode results = root.get("results"); // Expecting array of results for each image

            if (results != null && results.isArray()) {
                log.info("🎯 Multiple images matcher found results for {} images (session: {})", results.size(), sessionId);
            } else {
                log.warn("⚠️ No results found in multiple images response (session: {})", sessionId);
            }

            return root;

        } catch (Exception e) {
            log.error("❌ Failed to send images to matcher service (session: {}): {}", sessionId, e.getMessage(), e);
            return null;
        }
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

    public interface SeriesUpdateRequest extends SeriesRequest {
    }
}