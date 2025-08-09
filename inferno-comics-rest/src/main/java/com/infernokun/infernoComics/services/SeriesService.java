package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.controllers.ProgressController;
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
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
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

    private final WebClient webClient;

    private final Map<Integer, List<GCDCover>> urlCache = new HashMap<>();

    public SeriesService(SeriesRepository seriesRepository, IssueService issueService,
                         ComicVineService comicVineService,
                         DescriptionGeneratorService descriptionGeneratorService,
                         GCDatabaseService gcDatabaseService,
                         ModelMapper modelMapper,
                         InfernoComicsConfig infernoComicsConfig,
                         ProgressService progressService) {
        this.seriesRepository = seriesRepository;
        this.issueService = issueService;
        this.comicVineService = comicVineService;
        this.descriptionGeneratorService = descriptionGeneratorService;
        this.gcDatabaseService = gcDatabaseService;
        this.modelMapper = modelMapper;
        this.progressService = progressService;
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
    @Cacheable(value = "all-series")
    public List<Series> getAllSeries() {
        log.info("Fetching all series from database");
        List<Series> seriesList = seriesRepository.findAll();
        seriesList.forEach(series ->
                series.setIssueCount(issueService.getIssuesBySeriesId(series.getId()).size()));
        return seriesList;
    }

    @Cacheable(value = "series", key = "#id")
    @Transactional(readOnly = true)
    public Optional<Series> getSeriesById(Long id) {
        log.info("Fetching series with ID: {}", id);
        return seriesRepository.findByIdWithIssues(id);
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
                return comicVineService.searchIssues(series.get());
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
                    ComicVineService.ComicVineSeriesDto dto = comicVineService.getSeriesById(Long.valueOf(comicVineId));
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

        log.info("Created series with ID: {} (mapped {} GCD IDs)", savedSeries.getId(), gcdIds.size());
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

        Series series = modelMapper.map(request, Series.class);
        //mapRequestToSeries(request, series);

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
                .sorted((s1, s2) -> Integer.compare(s2.getIssues().size(), s1.getIssues().size()))
                .limit(limit)
                .collect(Collectors.toList());
    }

    // NEW SSE-BASED METHOD - Enhanced with real-time progress
    @Async("imageProcessingExecutor")
    public CompletableFuture<Void> startImageProcessingWithProgress(String sessionId, Long seriesId, byte[] imageBytes, String originalFilename, String contentType, String name, int year) {
        log.info("🚀 Starting SSE image processing session: {} for series ID: {}", sessionId, seriesId);

        try {
            // Initialize progress tracking
            //progressService.initializeSession(sessionId);
            ProgressUpdateRequest request;

            // Stage 1: Series validation (quick)

            progressService.updateProgress(new ProgressUpdateRequest(
                    sessionId, "preparing", 2, "Validating series..."));

            Optional<Series> series = seriesRepository.findById(seriesId);
            if (series.isEmpty()) {
                progressService.sendError(sessionId, "Series not found with id: " + seriesId);
                return CompletableFuture.completedFuture(null);
            }

            Series seriesEntity = series.get();
            log.info("📚 Processing series: '{}' ({})", seriesEntity.getName(), seriesEntity.getStartYear());

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
                List<ComicVineService.ComicVineIssueDto> results = searchComicVineIssues(seriesId);

                progressService.updateProgress(new ProgressUpdateRequest(
                        sessionId, "preparing", 8, String.format("Found %d ComicVine issues", results.size())));
                log.info("🦸 ComicVine completed: Found {} issues (session: {})", results.size(), sessionId);

                candidateCovers = results.stream()
                        .flatMap(issue -> {
                            List<GCDCover> covers = new ArrayList<>();

                            // First cover: Main cover from the issue
                            GCDCover mainCover = new GCDCover();
                            mainCover.setName(issue.getName());
                            mainCover.setIssueNumber(issue.getIssueNumber());
                            mainCover.setComicVineId(issue.getId());
                            mainCover.setUrls(Collections.singletonList(issue.getImageUrl()));
                            covers.add(mainCover);

                            // Second cover: Variant covers from the issue
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

                // Cache the covers
                seriesEntity.setCachedCoverUrls(candidateCovers);
                seriesRepository.save(seriesEntity);
            }

            // Stage 3: Hand off to Python for the heavy work (10% -> 100%)

            progressService.updateProgress(new ProgressUpdateRequest(
                    sessionId, "preparing", 10,
                    String.format("Sending %d candidates to image matcher...", candidateCovers.size())));

            // Let Python handle ALL remaining progress from 10% -> 100%
            JsonNode result = sendToImageMatcherWithProgress(sessionId, imageBytes, originalFilename, contentType, candidateCovers, seriesEntity);

            log.info("✅ SSE image processing completed for session: {}", sessionId);

        } catch (Exception e) {
            log.error("❌ Error in SSE image processing for session {}: {}", sessionId, e.getMessage(), e);
            progressService.sendError(sessionId, "Error processing image: " + e.getMessage());
        }

        return CompletableFuture.completedFuture(null);
    }

    private JsonNode sendToImageMatcherWithProgress(String sessionId, byte[] imageBytes,
                                                    String originalFilename, String contentType, List<GCDCover> candidateCovers, Series seriesEntity) {
        try {
            log.info("📤 Preparing Flask SSE image matcher request for session: {}...", sessionId);
            log.info("    Image file: {} ({} bytes)", originalFilename, imageBytes.length);
            log.info("    ✅ Candidate covers: {}", candidateCovers.size());

            MultipartBodyBuilder builder = new MultipartBodyBuilder();

            // Create ByteArrayResource from image bytes
            builder.part("image", new ByteArrayResource(imageBytes) {
                @Override
                public String getFilename() {
                    return originalFilename;
                }
            }).contentType(MediaType.valueOf(contentType != null ? contentType : "image/jpeg"));

            // Convert GCDCover objects to JSON and send as candidate_covers
            ObjectMapper mapper = new ObjectMapper();
            try {
                String candidateCoversJson = mapper.writeValueAsString(candidateCovers);
                builder.part("candidate_covers", candidateCoversJson);
                log.info("📤 Sending {} candidate covers as JSON (session: {})", candidateCovers.size(), sessionId);
            } catch (JsonProcessingException e) {
                log.error("❌ Failed to serialize candidate covers to JSON: {}", e.getMessage());
                throw new RuntimeException("Failed to serialize candidate covers", e);
            }

            // Add session ID so Python can report progress directly
            builder.part("session_id", sessionId);

            // Add metadata for better debugging
            builder.part("series_name", seriesEntity.getName());
            builder.part("series_start_year", seriesEntity.getStartYear().toString());
            builder.part("total_candidates", String.valueOf(candidateCovers.size()));
            builder.part("urls_scraped", "true");

            log.info("📤 Sending request to image matcher service (session: {})...", sessionId);
            long startTime = System.currentTimeMillis();

            String response = webClient.post()
                    .uri("/image-matcher")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            long duration = System.currentTimeMillis() - startTime;
            log.info("📥 Image matcher response received in {}ms (session: {})", duration, sessionId);

            JsonNode root = mapper.readTree(response);
            JsonNode topMatches = root.get("top_matches");

            if (topMatches != null && topMatches.isArray()) {
                log.info("🎯 Image matcher found {} top matches (session: {})", topMatches.size(), sessionId);

                // Debug: Log match details with comic names
                for (int i = 0; i < Math.min(3, topMatches.size()); i++) {
                    JsonNode match = topMatches.get(i);
                    log.info("    Match {}: drop={}, issue={}, comic='{}', url={}, similarity={}",
                            i + 1,
                            match.has("similarity") && match.get("similarity").asDouble() < 0.15,
                            match.has("issue_name") ? match.get("issue_name").asText() : "N/A",
                            match.has("comic_name") ? match.get("comic_name").asText() : "N/A",
                            match.has("url") ? match.get("url").asText() : "N/A",
                            match.has("similarity") ? match.get("similarity").asDouble() : 0);
                }
            } else {
                log.warn("⚠️ No top_matches found in response (session: {})", sessionId);
            }

            return root;

        } catch (Exception e) {
            log.error("❌ Failed to send image to matcher service (session: {}): {}", sessionId, e.getMessage(), e);
            throw new RuntimeException("Failed to send image to matcher service", e);
        }
    }

    @Async("imageProcessingExecutor")
    public CompletableFuture<Void> startMultipleImagesProcessingWithProgress(String sessionId, Long seriesId, List<SeriesController.ImageData> imageDataList, String name, int year) {
        log.info("🚀 Starting SSE multiple images processing session: {} for series ID: {} with {} images",
                sessionId, seriesId, imageDataList.size());

        try {
            // Initialize progress tracking
            //ProgressData progressData = progressService.initializeSession(sessionId);

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

            Optional<Series> series = seriesRepository.findById(seriesId);
            if (series.isEmpty()) {
                progressService.sendError(sessionId, "Series not found with id: " + seriesId);
                return CompletableFuture.completedFuture(null);
            }

            Series seriesEntity = series.get();
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
                List<ComicVineService.ComicVineIssueDto> results = searchComicVineIssues(seriesId);


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

                // Cache the covers
                seriesEntity.setCachedCoverUrls(candidateCovers);
                seriesRepository.save(seriesEntity);
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
            // FIXED: Don't send completion here - Python already sent it via SSE
            // Just log that we received the result
            log.info("📋 Received result from Python for session: {}, Python controls completion timing", sessionId);

            // Log the result structure for debugging
            log.info("🔍 Result structure for session {}: has results={}, has top_matches={}, has summary={}",
                    sessionId,
                    result.has("results"),
                    result.has("top_matches"),
                    result.has("summary"));

            if (result.has("results")) {
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

            // Python sends the complete
            //progressService.sendComplete(sessionId, result);

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

    // Update request
    public interface SeriesUpdateRequest extends SeriesRequest {
    }
}