package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.clients.InfernoComicsWebClient;
import com.infernokun.infernoComics.controllers.SeriesController;
import com.infernokun.infernoComics.models.*;
import com.infernokun.infernoComics.models.dto.SeriesRequest;
import com.infernokun.infernoComics.models.enums.StartedBy;
import com.infernokun.infernoComics.models.gcd.GCDCover;
import com.infernokun.infernoComics.models.gcd.GCDSeries;
import com.infernokun.infernoComics.models.sync.ProcessedFile;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.services.sync.WeirdService;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.repositories.sync.ProcessedFileRepository;
import com.infernokun.infernoComics.services.gcd.GCDatabaseService;
import com.infernokun.infernoComics.utils.CacheConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.modelmapper.ModelMapper;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.CacheManager;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.BodyInserters;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import static com.infernokun.infernoComics.utils.InfernoComicsUtils.createEtag;

@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class SeriesService {
    private final InfernoComicsWebClient webClient;

    private final WeirdService weirdService;
    private final ProgressDataService progressDataService;
    private final ComicVineService comicVineService;
    private final GCDatabaseService gcDatabaseService;
    private final DescriptionGeneratorService descriptionGeneratorService;

    private final IssueRepository issueRepository;
    private final SeriesRepository seriesRepository;
    private final ProcessedFileRepository processedFileRepository;

    private final ModelMapper modelMapper;
    private final CacheManager cacheManager;

    @CacheEvict(value = "series", key = "#seriesId")
    @Transactional
    public Series reverifyMetadata(Long seriesId) {
        Series series = getSeriesById(seriesId);
        if (series == null) {
            throw new IllegalArgumentException("Series with ID " + seriesId + " not found");
        }

        List<String> originalComicVineIds = new ArrayList<>(series.getComicVineIds() != null ?
                series.getComicVineIds() : List.of());
        Integer originalIssuesAvailableCount = series.getIssuesAvailableCount();

        log.info("Reverifying metadata for series '{}' (ID: {})", series.getName(), seriesId);

        AtomicInteger totalComics = new AtomicInteger(0);
        List<String> newGcdIds = new ArrayList<>();

        // Process each Comic Vine ID
        if (series.getComicVineIds() != null && !series.getComicVineIds().isEmpty()) {
            for (String comicVineId : series.getComicVineIds()) {
                try {
                    ComicVineService.ComicVineSeriesDto dto = comicVineService.getComicVineSeriesById(Long.parseLong(comicVineId));

                    if (dto != null) {
                        totalComics.addAndGet(dto.getIssueCount() != null ? dto.getIssueCount() : 0);

                        // Try to find GCD mapping
                        try {
                            Optional<GCDSeries> gcdSeriesOptional = gcDatabaseService
                                    .findGCDSeriesWithComicVineSeries(dto.getName(), dto.getStartYear(), dto.getIssueCount());

                            if (gcdSeriesOptional.isPresent()) {
                                String gcdId = String.valueOf(gcdSeriesOptional.get().getId());
                                newGcdIds.add(gcdId);
                                log.debug("✅ Mapped Comic Vine ID {} to GCD ID {}", comicVineId, gcdId);
                            } else {
                                log.warn("No GCD mapping found for Comic Vine ID: {}", comicVineId);
                            }
                        } catch (Exception e) {
                            log.error("Error finding GCD mapping for Comic Vine ID {}: {}", comicVineId, e.getMessage());
                        }
                    } else {
                        log.warn("No Comic Vine data found for ID: {}", comicVineId);
                    }
                } catch (Exception e) {
                    log.error("Error processing Comic Vine ID {}: {}", comicVineId, e.getMessage());
                }
            }
        }

        // Update series with new metadata
        series.setIssuesAvailableCount(totalComics.get());
        series.setGcdIds(newGcdIds);
        series.setCachedCoverUrls(new ArrayList<>());
        series.setLastReverification(LocalDateTime.now());

        Series updatedSeries = seriesRepository.save(series);

        // Cache management - evict related caches
        try {
            if (!originalComicVineIds.isEmpty()) {
                evictCacheValue("comic-vine-issues", seriesId.toString());
            }

            evictListCaches();
            evictCacheValue("series-stats", "global");

            // Evict search caches if series data changed significantly
            if (!originalComicVineIds.equals(newGcdIds) || !originalIssuesAvailableCount.equals(totalComics.get())) {
                Arrays.asList("series-search", "series-advanced-search").forEach(cacheName -> {
                    try {
                        Objects.requireNonNull(cacheManager.getCache(cacheName)).clear();
                    } catch (Exception e) {
                        log.warn("Failed to clear search cache {}: {}", cacheName, e.getMessage());
                    }
                });
            }

        } catch (Exception e) {
            log.warn("Error during cache eviction for series {}: {}", seriesId, e.getMessage());
        }

        log.info("✅ Reverification complete for '{}': {} issues from {} Comic Vine IDs → {} GCD mappings",
                updatedSeries.getName(), totalComics.get(), originalComicVineIds.size(), newGcdIds.size());


        return updatedSeries;
    }

    public List<Series> getAllSeries() {
        List<Series> cachedSeries = getCachedValue();

        if (cachedSeries != null) {
            log.debug("Returning cached series list with {} items", cachedSeries.size());
            return cachedSeries;
        }

        List<Series> seriesList = seriesRepository.findAll();
        seriesList.forEach(series -> {
            List<Issue> issues = issueRepository.findBySeriesId(series.getId());
            series.setIssuesOwnedCount(issues.size());
        });

        putCacheValue(seriesList);
        return seriesList;
    }

    @Cacheable(value = "series", key = "#id", unless = "#result == null")
    @Transactional(readOnly = true)
    public Series getSeriesById(Long id) {
        Series series = seriesRepository.findByIdWithIssues(id).orElse(null);
        if (series == null) {
            return null;
        }
        series.setIssuesOwnedCount(series.getIssues().size());
        return series;
    }

    public ComicVineService.ComicVineSeriesDto getComicVineSeriesById(Long comicVineId) {
        log.debug("Fetching Comic Vine series with ID: {}", comicVineId);
        return comicVineService.getComicVineSeriesById(comicVineId);
    }

    @Cacheable(value = "series-search", key = "#query", unless = "#result.isEmpty()")
    public List<Series> searchSeries(String query) {
        return seriesRepository.findByNameContainingIgnoreCaseOrPublisherContainingIgnoreCase(query, query);
    }

    @Cacheable(value = "comic-vine-series", key = "#query", unless = "#result.isEmpty()")
    public List<ComicVineService.ComicVineSeriesDto> searchComicVineSeries(String query) {
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
    public Series createSeries(SeriesRequest request) {
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

        evictListCaches();

        log.info("Created series '{}' with ID: {} ({} GCD mappings)",
                savedSeries.getName(), savedSeries.getId(), gcdIds.size());
        return savedSeries;
    }

    @CacheEvict(value = "series", key = "#id")
    @Transactional
    public Series updateSeries(Long id, SeriesRequest request) {
        try {
            Series existingSeries = seriesRepository.findById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Series with ID " + id + " not found"));

            List<String> originalComicVineIds = new ArrayList<>(existingSeries.getComicVineIds() != null ?
                    existingSeries.getComicVineIds() : List.of());

            existingSeries.setName(request.getName());
            existingSeries.setDescription(request.getDescription());
            existingSeries.setPublisher(request.getPublisher());
            existingSeries.setStartYear(request.getStartYear());
            existingSeries.setEndYear(request.getEndYear());
            existingSeries.setImageUrl(request.getImageUrl());

            List<String> requestComicVineIds = request.getComicVineIds() != null ?
                    new ArrayList<>(request.getComicVineIds()) : new ArrayList<>();

            existingSeries.setComicVineIds(new ArrayList<>(requestComicVineIds));

            if (request.getComicVineId() != null) {
                existingSeries.setComicVineId(request.getComicVineId());
            }

            List<String> newComicVineIds = existingSeries.getComicVineIds() != null ?
                    new ArrayList<>(existingSeries.getComicVineIds()) : new ArrayList<>();

            if (newComicVineIds.isEmpty()) {
                existingSeries.setComicVineId(null);
            } else if (existingSeries.getComicVineId() == null || !newComicVineIds.contains(existingSeries.getComicVineId())) {
                String newPrimary = newComicVineIds.getFirst();
                existingSeries.setComicVineId(newPrimary);
            }

            // ALWAYS update GCD mappings when Comic Vine IDs change
            if (!originalComicVineIds.equals(newComicVineIds)) {
                log.info("Comic Vine IDs changed for series {}: {} → {} IDs",
                        id, originalComicVineIds.size(), newComicVineIds.size());

                if (newComicVineIds.isEmpty()) {
                    existingSeries.setGcdIds(new ArrayList<>());
                } else {
                    updateGcdMappings(existingSeries, newComicVineIds);
                }

                // Recalculate metadata if we have Comic Vine associations
                if (!newComicVineIds.isEmpty()) {
                    recalculateSeriesMetadataFromComicVine(existingSeries, newComicVineIds);
                }
            }

            // Save the updated series
            Series updatedSeries = seriesRepository.save(existingSeries);

            // FIX 1: Add explicit flush to ensure data is persisted before cache operations
            seriesRepository.flush();

            log.info("✅ Series saved and flushed to database");

            // FIX 2: Wrap cache evictions in try-catch to prevent them from blocking the response
            try {
                evictListCaches();
                descriptionGeneratorService.evictSeriesCache(updatedSeries);

                if (!originalComicVineIds.equals(newComicVineIds)) {
                    evictCacheValue("comic-vine-issues", id.toString());
                }
            } catch (Exception cacheException) {
                // Don't let cache eviction failures block the response
                log.warn("Cache eviction failed, but series was updated successfully: {}", cacheException.getMessage());
            }

            log.info("Updated series '{}': {} Comic Vine IDs, {} GCD mappings",
                    updatedSeries.getName(),
                    updatedSeries.getComicVineIds() != null ? updatedSeries.getComicVineIds().size() : 0,
                    updatedSeries.getGcdIds() != null ? updatedSeries.getGcdIds().size() : 0);

            return updatedSeries;

        } catch (Exception e) {
            log.error("Error updating series {}: {}", id, e.getMessage(), e);
            throw e;
        }
    }

    private void updateGcdMappings(Series series, List<String> comicVineIds) {
        try {
            List<String> newGcdIds = new ArrayList<>();

            for (String comicVineId : comicVineIds) {
                try {
                    ComicVineService.ComicVineSeriesDto dto = comicVineService.getComicVineSeriesById(Long.valueOf(comicVineId));

                    if (dto != null) {
                        log.debug("Found Comic Vine data: name='{}', startYear={}, issueCount={}",
                                dto.getName(), dto.getStartYear(), dto.getIssueCount());

                        Optional<GCDSeries> gcdSeriesOptional = gcDatabaseService
                                .findGCDSeriesWithComicVineSeries(dto.getName(), dto.getStartYear(), dto.getIssueCount());

                        if (gcdSeriesOptional.isPresent()) {
                            String gcdId = String.valueOf(gcdSeriesOptional.get().getId());
                            newGcdIds.add(gcdId);
                            log.debug("✅ Mapped Comic Vine ID {} to GCD ID {}", comicVineId, gcdId);
                        } else {
                            log.warn("No GCD mapping found for Comic Vine ID: {}", comicVineId);
                        }
                    } else {
                        log.warn("No Comic Vine data found for ID: {}", comicVineId);
                    }
                } catch (Exception e) {
                    log.error("Error processing Comic Vine ID {}: {}", comicVineId, e.getMessage());
                    // Continue with other IDs even if one fails
                }
            }

            series.setGcdIds(new ArrayList<>(newGcdIds));
        } catch (Exception e) {
            log.error("Error updating GCD mappings for series {}: {}", series.getId(), e.getMessage(), e);
        }
    }

    // Fixed recalculate method using your correct method name
    private void recalculateSeriesMetadataFromComicVine(Series series, List<String> comicVineIds) {
        try {
            List<ComicVineService.ComicVineSeriesDto> comicVineData = new ArrayList<>();

            for (String comicVineId : comicVineIds) {
                try {
                    ComicVineService.ComicVineSeriesDto dto = comicVineService.getComicVineSeriesById(Long.valueOf(comicVineId));

                    if (dto != null) {
                        comicVineData.add(dto);
                        log.debug("✅ Got metadata: name='{}', startYear={}, endYear={}, issueCount={}",
                                dto.getName(), dto.getStartYear(), dto.getEndYear(), dto.getIssueCount());
                    } else {
                        log.warn("No Comic Vine data found for ID: {}", comicVineId);
                    }
                } catch (Exception e) {
                    log.error("Error processing Comic Vine ID {}: {}", comicVineId, e.getMessage());
                }
            }

            if (comicVineData.isEmpty()) {
                log.warn("No valid Comic Vine data found for metadata recalculation for series {}", series.getId());
                return;
            }

            log.debug("Successfully fetched {} Comic Vine series data objects", comicVineData.size());

            // Recalculate date range
            List<Integer> startYears = comicVineData.stream()
                    .map(ComicVineService.ComicVineSeriesDto::getStartYear)
                    .filter(Objects::nonNull)
                    .toList();

            List<Integer> endYears = comicVineData.stream()
                    .map(ComicVineService.ComicVineSeriesDto::getEndYear)
                    .filter(Objects::nonNull)
                    .toList();

            if (!startYears.isEmpty()) {
                Integer earliestStart = Collections.min(startYears);
                if (!earliestStart.equals(series.getStartYear())) {
                    log.debug("Updating start year from {} to {}", series.getStartYear(), earliestStart);
                    series.setStartYear(earliestStart);
                }
            }

            if (!endYears.isEmpty()) {
                Integer latestEnd = Collections.max(endYears);
                if (!latestEnd.equals(series.getEndYear())) {
                    log.debug("Updating end year from {} to {}", series.getEndYear(), latestEnd);
                    series.setEndYear(latestEnd);
                }
            }

            // Recalculate total available issue count from Comic Vine
            int totalIssueCount = comicVineData.stream()
                    .mapToInt(data -> data.getIssueCount() != null ? data.getIssueCount() : 0)
                    .sum();

            if (totalIssueCount != series.getIssuesAvailableCount()) {
                log.debug("Updating available issue count from {} to {}", series.getIssuesAvailableCount(), totalIssueCount);
                series.setIssuesAvailableCount(totalIssueCount);
            }
        } catch (Exception e) {
            log.error("Error recalculating series metadata from Comic Vine for series {}: {}", series.getId(), e.getMessage(), e);
        }
    }

    @CacheEvict(value = "series", key = "#id")
    @Transactional
    public void deleteSeries(Long id) {
        if (!seriesRepository.existsById(id)) {
            throw new IllegalArgumentException("Series with ID " + id + " not found");
        }

        // Get series for cache eviction before deletion
        Optional<Series> series = seriesRepository.findById(id);
        series.ifPresent(descriptionGeneratorService::evictSeriesCache);

        seriesRepository.deleteById(id);
        evictListCaches();

        log.info("Deleted series with ID: {}", id);
    }

    // Cache series statistics with proper TTL
    @Cacheable(value = "series-stats", key = "'global'")
    public Map<String, Object> getSeriesStats() {
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
        return seriesRepository.findRecentSeries(limit);
    }

    // Advanced series search with caching
    @Cacheable(value = "series-advanced-search",
            key = "T(java.util.Objects).hash(#publisher, #startYear, #endYear)")
    public List<Series> searchSeriesByPublisherAndYear(String publisher, Integer startYear, Integer endYear) {
        log.debug("Advanced search - Publisher: {}, Start Year: {}, End Year: {}", publisher, startYear, endYear);

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
        evictListCaches();

        log.info("Created series '{}' from Comic Vine with ID: {}",
                savedSeries.getName(), savedSeries.getId());
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
            } catch (Exception e) {
                log.warn("Failed to clear cache {}: {}", cacheName, e.getMessage());
            }
        });
    }

    // Get popular series (most comic books owned)
    @Cacheable(value = "popular-series", key = "#limit")
    public List<Series> getPopularSeries(int limit) {
        return seriesRepository.findAll().stream()
                .sorted((s1, s2) -> Integer.compare(s2.getIssues().size(), s1.getIssues().size()))
                .limit(limit)
                .collect(Collectors.toList());
    }

    // Helper method to evict list-based caches when series data changes
    private void evictListCaches() {
        Arrays.asList(CacheConstants.CacheNames.SERIES_LIST, "recent-series", "popular-series", "series-stats")
                .forEach(cacheName -> {
                    try {
                        Objects.requireNonNull(cacheManager.getCache(cacheName)).clear();
                    } catch (Exception e) {
                        log.warn("Failed to evict cache {}: {}", cacheName, e.getMessage());
                    }
                });
    }

    // Helper method to get cached values
    @SuppressWarnings("unchecked")
    private <T> T getCachedValue() {
        try {
            var cache = cacheManager.getCache("series-list");
            if (cache != null) {
                var wrapper = cache.get(CacheConstants.CacheKeys.ALL_SERIES_LIST);
                if (wrapper != null) {
                    return (T) wrapper.get();
                }
            }
        } catch (Exception e) {
            log.warn("Failed to get cached value from {} with key {}: {}", "series-list", CacheConstants.CacheKeys.ALL_SERIES_LIST, e.getMessage());
        }
        return null;
    }

    // Helper method to put cached values
    private void putCacheValue(Object value) {
        try {
            var cache = cacheManager.getCache("series-list");
            if (cache != null) {
                cache.put(CacheConstants.CacheKeys.ALL_SERIES_LIST, value);
            }
        } catch (Exception e) {
            log.warn("Failed to cache value in {} with key {}: {}", "series-list", CacheConstants.CacheKeys.ALL_SERIES_LIST, e.getMessage());
        }
    }

    // Helper method to evict specific cache entries
    private void evictCacheValue(String cacheName, String key) {
        try {
            var cache = cacheManager.getCache(cacheName);
            if (cache != null) {
                cache.evict(key);
            }
        } catch (Exception e) {
            log.warn("Failed to evict cache entry {} from {}: {}", key, cacheName, e.getMessage());
        }
    }

    @Async("imageProcessingExecutor")
    public CompletableFuture<Void> startMultipleImagesProcessingWithProgress(String sessionId,
                                                                             Long seriesId,
                                                                             List<SeriesController.ImageData> imageDataList,
                                                                             StartedBy startedBy,
                                                                             String name)
    {
        log.info("Starting image processing session: {} for series '{}' with {} images", sessionId, name, imageDataList.size());
        List<ProcessedFile> filesToRecord = new ArrayList<>();
        JsonNode root;

        try {
            int timeoutSeconds = 20;
            int intervalMs = 2000;
            int waited = 0;

            if (startedBy == StartedBy.MANUAL) {
                while (!progressDataService.emitterIsPresent(sessionId)) {
                    if (waited >= timeoutSeconds * 1000) {
                        throw new RuntimeException("Timeout: Emitter for sessionId " + sessionId + " not found after " + timeoutSeconds + " seconds.");
                    }
                    Thread.sleep(intervalMs);
                    waited += intervalMs;
                }
            }

            // Stage 1: Series validation
            progressDataService.updateProgress(new ProgressUpdateRequest(
                    sessionId, "preparing", 2,
                    String.format("Validating series and %d images...", imageDataList.size())));

            Series seriesEntity = getSeriesById(seriesId);
            if (seriesEntity == null) {
                progressDataService.sendError(sessionId, "Series not found with id: " + seriesId);
                return CompletableFuture.completedFuture(null);
            }

            List<GCDCover> candidateCovers;

            if (seriesEntity.getCachedCoverUrls() != null && !seriesEntity.getCachedCoverUrls().isEmpty() && seriesEntity.getLastCachedCovers() != null) {
                log.info("Using cached covers for session: {}", sessionId);
                progressDataService.updateProgress(new ProgressUpdateRequest(
                        sessionId, "preparing", 8, "Using cached cover data..."));
                candidateCovers = seriesEntity.getCachedCoverUrls();
            } else {
                // Stage 2: ComicVine search
                progressDataService.updateProgress(new ProgressUpdateRequest(
                        sessionId, "preparing", 5, "Searching ComicVine database..."));

                List<ComicVineService.ComicVineIssueDto> results = searchComicVineIssues(seriesId);

                progressDataService.updateProgress(new ProgressUpdateRequest(
                        sessionId, "preparing", 8,
                        String.format("Found %d ComicVine issues for %d input images",
                                results.size(), imageDataList.size())));


                Set<Long> existingComicVineIds = issueRepository.findBySeriesId(seriesId)
                        .stream()
                        .map(Issue::getComicVineId)
                        .filter(Objects::nonNull)
                        .map(Long::parseLong)
                        .collect(Collectors.toSet());

                log.info("Found {} existing Comic Vine IDs in collection: {}", existingComicVineIds.size(), existingComicVineIds);
                log.info("Processing {} Comic Vine issues for filtering", results.size());

                candidateCovers = results.stream()
                        .flatMap(issue -> {
                            List<GCDCover> covers = new ArrayList<>();
                            Long issueId = Long.parseLong(issue.getId());

                            // Main cover from the issue - only add if not already owned
                            if (!existingComicVineIds.contains(issueId)) {
                                log.debug("Adding main cover for issue {} ({})", issue.getIssueNumber(), issueId);
                                GCDCover mainCover = new GCDCover();
                                mainCover.setName(issue.getName());
                                mainCover.setIssueNumber(issue.getIssueNumber());
                                mainCover.setComicVineId(issue.getId());
                                mainCover.setUrls(Collections.singletonList(issue.getImageUrl()));
                                covers.add(mainCover);

                                // Only add variants if the parent issue is not owned
                                issue.getVariants().forEach(variant -> {
                                    log.debug("Adding variant cover for issue {} variant {} (parent: {})",
                                            issue.getIssueNumber(), variant.getId(), issueId);
                                    GCDCover variantCover = new GCDCover();
                                    variantCover.setName(issue.getName());
                                    variantCover.setIssueNumber(issue.getIssueNumber());
                                    variantCover.setComicVineId(variant.getId());
                                    variantCover.setUrls(Collections.singletonList(variant.getOriginalUrl()));
                                    variantCover.setParentComicVineId(issue.getId());
                                    covers.add(variantCover);
                                });
                            }

                            return covers.stream();
                        })
                        .collect(Collectors.toList());

                log.info("Filtered to {} candidate covers from {} original issues", candidateCovers.size(), results.size());
                log.info("Breakdown: {} main covers + {} variant covers",
                        candidateCovers.stream().mapToLong(c -> c.getParentComicVineId() == null ? 1 : 0).sum(),
                        candidateCovers.stream().mapToLong(c -> c.getParentComicVineId() != null ? 1 : 0).sum());

                log.info("Generated {} candidate covers for session: {}", candidateCovers.size(), sessionId);

                if (candidateCovers.isEmpty()) {
                    progressDataService.sendError(sessionId, "No valid candidate cover urls found!");
                }

                // Cache the covers and update cache
                seriesEntity.setCachedCoverUrls(candidateCovers);
                seriesRepository.save(seriesEntity);
                evictCacheValue("series", seriesId.toString());
            }

            // Stage 3: Hand off to Python for processing
            progressDataService.updateProgress(new ProgressUpdateRequest(
                    sessionId, "preparing", 10,
                    String.format("Sending %d images with %d candidates to image matcher...",
                            imageDataList.size(), candidateCovers.size())));

            log.info("Sending {} images with {} candidates to matcher service for session: {}",
                    imageDataList.size(), candidateCovers.size(), sessionId);

            MultipartBodyBuilder builder = new MultipartBodyBuilder();

            // Add all images with indexed names
            for (int i = 0; i < imageDataList.size(); i++) {
                SeriesController.ImageData imageData = imageDataList.get(i);
                builder.part("images[" + i + "]", new ByteArrayResource(imageData.bytes()) {
                    @Override
                    public String getFilename() {
                        return imageData.originalFilename();
                    }
                }).contentType(MediaType.valueOf(imageData.contentType() != null ? imageData.contentType() : "image/jpeg"));

                String fileEtag = createEtag(imageData.bytes());

                Optional<ProcessedFile> processedFileOptional = processedFileRepository.findByFileName(imageData.originalFilename());
                processedFileOptional.ifPresent(weirdService::deleteProcessedFile);

                filesToRecord.add(ProcessedFile.builder()
                        .seriesId(seriesEntity.getId())
                        .filePath(imageData.filePath() != null ? imageData.filePath() : imageData.originalFilename())
                        .fileName(imageData.originalFilename())
                        .fileLastModified(imageData.lastModified())
                        .fileSize(imageData.fileSize())
                        .fileEtag(fileEtag)
                        .sessionId(sessionId)
                        .processingStatus(ProcessedFile.ProcessingStatus.PROCESSING)
                        .processedAt(LocalDateTime.now())
                        .build());
            }

            weirdService.saveProcessedFiles(filesToRecord);

            // Convert GCDCover objects to JSON and send as candidate_covers
            ObjectMapper mapper = new ObjectMapper();
            try {
                String candidateCoversJson = mapper.writeValueAsString(candidateCovers);
                builder.part("candidate_covers", candidateCoversJson);
            } catch (JsonProcessingException e) {
                log.error("Failed to serialize candidate covers to JSON: {}", e.getMessage());
                return null;
            }

            // Add session ID so Python can report progress directly
            builder.part("session_id", sessionId);
            builder.part("series_name", seriesEntity.getName());
            builder.part("series_start_year", seriesEntity.getStartYear().toString());
            builder.part("total_candidates", String.valueOf(candidateCovers.size()));
            builder.part("total_images", String.valueOf(imageDataList.size()));
            builder.part("urls_scraped", "true");

            long startTime = System.currentTimeMillis();
            String response = webClient.recognitionClient().post()
                    .uri("/image-matcher-multiple")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            long duration = System.currentTimeMillis() - startTime;
            log.info("Matcher response received in {}s ({}ms) for session: {}",
                    duration / 1000,
                    duration % 1000,
                    sessionId);

            root = mapper.readTree(response);
            JsonNode results = root.get("results");

            if (results != null && results.isArray()) {
                log.info("Matcher found results for {} images (session: {})", results.size(), sessionId);
            } else {
                log.warn("No results found in matcher response (session: {})", sessionId);
            }


            log.info("Image processing completed for session: {}", sessionId);

        } catch (Exception e) {
            log.error("Error in image processing for session {}: {}", sessionId, e.getMessage());
            filesToRecord.forEach(file -> file.setProcessingStatus(ProcessedFile.ProcessingStatus.FAILED));
            progressDataService.sendError(sessionId, "Error processing images: " + e.getMessage());
        }

        return CompletableFuture.completedFuture(null);
    }
}