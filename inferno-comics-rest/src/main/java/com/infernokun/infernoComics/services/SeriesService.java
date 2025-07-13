package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.controllers.SeriesController;
import com.infernokun.infernoComics.models.DescriptionGenerated;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.gcd.GCDCover;
import com.infernokun.infernoComics.models.gcd.GCDIssue;
import com.infernokun.infernoComics.models.gcd.GCDSeries;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.services.gcd.GCDAPIService;
import com.infernokun.infernoComics.services.gcd.GCDCoverPageScraper;
import com.infernokun.infernoComics.services.gcd.GCDatabaseService;
import lombok.extern.slf4j.Slf4j;
import org.modelmapper.ModelMapper;
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
    private final GCDCoverPageScraper gcdCoverPageScraper;
    private final InfernoComicsConfig infernoComicsConfig;
    private final GCDAPIService gcdapiService;
    private final ModelMapper modelMapper;

    private final WebClient webClient;

    private final Map<Integer, List<GCDCover>> urlCache = new HashMap<>();

    public SeriesService(SeriesRepository seriesRepository,
                         ComicVineService comicVineService,
                         DescriptionGeneratorService descriptionGeneratorService, GCDatabaseService gcDatabaseService, GCDCoverPageScraper gcdCoverPageScraper, InfernoComicsConfig infernoComicsConfig1, GCDAPIService gcdapiService, ModelMapper modelMapper, InfernoComicsConfig infernoComicsConfig) {
        this.seriesRepository = seriesRepository;
        this.comicVineService = comicVineService;
        this.descriptionGeneratorService = descriptionGeneratorService;
        this.gcDatabaseService = gcDatabaseService;
        this.gcdCoverPageScraper = gcdCoverPageScraper;
        this.infernoComicsConfig = infernoComicsConfig1;
        this.gcdapiService = gcdapiService;
        this.modelMapper = modelMapper;
        urlCache.put(0, new ArrayList<>());
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
    public Series createSeries(SeriesController.SeriesCreateRequestDto request) {
        log.info("Creating series: {}", request.getName());

        Series series = this.modelMapper.map(request, Series.class);

        //mapRequestToSeries(request, series);

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

    public JsonNode addIssueByImage(Long seriesId, MultipartFile imageFile, String name, int year) {
        log.info("🚀 Starting image processing for series ID: {}", seriesId);


        if (seriesId == 0) {
            Series series = new Series(name, year);

            log.info("EVALUATION: for series: {}", seriesId);
            List<ComicVineService.ComicVineIssueDto> results = searchComicVineIssues(seriesId);

            List<GCDCover> candidateCovers = new ArrayList<>(results.stream()
                    .map(issue -> new GCDCover(
                            series.getName() + " #" + issue.getIssueNumber(),
                            issue.getName(),
                            Collections.singletonList(issue.getImageUrl()),
                            "comicVineAPI",
                            true,
                            ""
                    ))
                    .toList());
            log.info("Comic vine has {} GCDCovers", candidateCovers.size());
            int prev = candidateCovers.size();

            results.forEach(issueDto -> {
                GCDCover gcdCover = new GCDCover();

                gcdCover.setUrls(issueDto.getVariants().stream().map(ComicVineService.ComicVineIssueDto.VariantCover::getOriginalUrl).toList());
                gcdCover.setIssueName(series.getName() + " #" + issueDto.getIssueNumber());
                gcdCover.setIssueName(issueDto.getName());
                gcdCover.setFound(true);

                candidateCovers.add(gcdCover);
            });

            log.info("Variants added has {} GCDCovers", candidateCovers.size() - prev);


            urlCache.put(0, candidateCovers);

            return sendToImageMatcher(imageFile, candidateCovers, series);
        }

        Optional<Series> series = seriesRepository.findById(seriesId);
        if (series.isEmpty()) {
            log.error("❌ Series not found with id: {}", seriesId);
            throw new IllegalArgumentException("Series not found with id: " + seriesId);
        }

        Series seriesEntity = series.get();
        log.info("📚 Processing series: '{}' ({})", seriesEntity.getName(), seriesEntity.getStartYear());

        if (seriesEntity.getCachedCoverUrls() != null && !seriesEntity.getCachedCoverUrls().isEmpty() && seriesEntity.getLastCachedCovers() != null) {
            log.info("Using cached images");
            return sendToImageMatcher(imageFile, seriesEntity.getCachedCoverUrls(), seriesEntity);
        }

        // Step 1: Get ComicVine candidates
        log.info("🦸 Starting ComicVine search for series: {}", seriesId);
        List<ComicVineService.ComicVineIssueDto> results = searchComicVineIssues(seriesId);

        log.info("🦸 ComicVine completed: Found {} issues",
                results.size());

        List<GCDCover> candidateCovers = new ArrayList<>(results.stream()
                .map(issue -> new GCDCover(
                        seriesEntity.getName() + " #" + issue.getIssueNumber(),
                        issue.getName(),
                        Collections.singletonList(issue.getImageUrl()),
                        "comicVineAPI",
                        true,
                        ""
                ))
                .toList());
        log.info("Comic vine has {} GCDCovers", candidateCovers.size());

        int prev = candidateCovers.size();

        /*List<Long> gcdSeriesIds = gcDatabaseService.findGCDSeriesByYearBeganAndNameContainingIgnoreCase(
                seriesEntity.getStartYear(), seriesEntity.getName()).stream().map(GCDSeries::getId).toList();

        List<GCDIssue> gcdIssues = gcDatabaseService.findGCDIssueBySeriesIds(gcdSeriesIds);*/

        results.forEach(issueDto -> {
            GCDCover gcdCover = new GCDCover();

            gcdCover.setUrls(issueDto.getVariants().stream().map(ComicVineService.ComicVineIssueDto.VariantCover::getOriginalUrl).toList());
            gcdCover.setIssueName(seriesEntity.getName() + " #" + issueDto.getIssueNumber());
            gcdCover.setIssueName(issueDto.getName());
            gcdCover.setFound(true);

            candidateCovers.add(gcdCover);
        });

        log.info("Variants added has {} GCDCovers", candidateCovers.size() - prev);

        /*

        if (!infernoComicsConfig.isSkipScrape()) {
            gcdIssues.stream().limit(1).forEach(i -> {
                        GCDCover coverResult = gcdCoverPageScraper.scrapeCoverPage(i);
                candidateCovers.add(coverResult);
                    }
            );
        }

        if (infernoComicsConfig.isSkipScrape()) {
            // https://www.comics.org/api/series/103021/
            // Process your list of GCDCover objects here
            gcdSeriesIds.stream().limit(1).forEach(gcdSeriesId -> {
                this.gcdapiService.getIssueIdsFromSeries(gcdSeriesId)
                        .flatMapMany(Flux::fromIterable)
                        .flatMap(this.gcdapiService::getIssueById)
                        .map(issueResponse -> {
                            String title = issueResponse.getStorySet().stream()
                                    .filter(r -> "comic story".equals(r.getType()))
                                    .findFirst()
                                    .map(GCDAPIService.Story::getTitle)
                                    .orElse("");

                            return new GCDCover(
                                    seriesEntity.getName() + " # " + issueResponse.getDescriptor().split(" ")[0],
                                    title,
                                    Collections.singletonList(issueResponse.getCover()), // Single cover URL as list
                                    "api",
                                    true,
                                    ""
                            );
                        })
                        .collectList()
                        .subscribe(candidateCovers::addAll);
            });
        }

        */
        seriesEntity.setCachedCoverUrls(candidateCovers);
        //seriesEntity.setLastCachedCovers(LocalDateTime.now());
        seriesRepository.save(seriesEntity);

        return sendToImageMatcher(imageFile, candidateCovers, seriesEntity);
    }

    private JsonNode sendToImageMatcher(MultipartFile imageFile, List<GCDCover> candidateCovers, Series seriesEntity) {
        try {
            log.info(" Preparing image matcher request...");
            log.info("    Image file: {} ({} bytes)",
                    imageFile.getOriginalFilename(), imageFile.getSize());
            log.info("   ✅ Candidate covers: {}", candidateCovers.size());

            MultipartBodyBuilder builder = new MultipartBodyBuilder();

            builder.part("image", imageFile.getResource())
                    .contentType(MediaType.valueOf(Objects.requireNonNull(imageFile.getContentType())));

            // Convert GCDCover objects to JSON and send as candidate_covers
            ObjectMapper mapper = new ObjectMapper();
            try {
                String candidateCoversJson = mapper.writeValueAsString(candidateCovers);
                builder.part("candidate_covers", candidateCoversJson);
                log.info(" Sending {} candidate covers as JSON", candidateCovers.size());
            } catch (JsonProcessingException e) {
                log.error("❌ Failed to serialize candidate covers to JSON: {}", e.getMessage());
                throw new RuntimeException("Failed to serialize candidate covers", e);
            }

            // Add metadata for better debugging
            builder.part("series_name", seriesEntity.getName());
            builder.part("series_start_year", seriesEntity.getStartYear().toString());
            builder.part("total_candidates", String.valueOf(candidateCovers.size()));
            builder.part("urls_scraped", "true");

            log.info(" Sending request to image matcher service...");
            long startTime = System.currentTimeMillis();

            String response = webClient.post()
                    .uri("/image-matcher")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            long duration = System.currentTimeMillis() - startTime;
            log.info(" Image matcher response received in {}ms", duration);

            JsonNode root = mapper.readTree(response);
            JsonNode topMatches = root.get("top_matches");

            if (topMatches != null && topMatches.isArray()) {
                log.info(" Image matcher found {} top matches", topMatches.size());

                // Debug: Log match details with comic names
                for (int i = 0; i < Math.min(3, topMatches.size()); i++) {
                    JsonNode match = topMatches.get(i);
                    log.info("    Match {}: drop={}, issue={}, comic='{}', url={}, similarity={}",
                            i + 1,
                            match.has("similarity") && match.get("similarity").asDouble() < 0.15,
                            match.has("issue_name") ? match.get("issue_name").asText() : "N/A",
                            match.has("comic_name") ? match.get("comic_name").asText() : "N/A",
                            match.has("url") ? match.get("url").asText() : "N/A",
                            match.has("similarity") ? match.get("similarity").asDouble() : 0);
                }
            } else {
                log.warn("⚠ No top_matches found in response");
            }

            return topMatches;

        } catch (Exception e) {
            log.error("❌ Failed to send image to matcher service: {}", e.getMessage(), e);
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