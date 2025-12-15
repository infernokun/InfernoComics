package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.clients.InfernoComicsWebClient;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.utils.GenericTextCleaner;
import lombok.*;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ComicVineService {
    private final ObjectMapper objectMapper;
    private final InfernoComicsConfig infernoComicsConfig;
    private final StringRedisTemplate stringRedisTemplate;
    private final InfernoComicsWebClient webClient;

    private static final String SERIES_CACHE_PREFIX = "comic_vine_series:";
    private static final String ISSUES_CACHE_PREFIX = "comic_vine_issues:";
    private static final long CACHE_TTL_HOURS = 24; // Cache Comic Vine data for 24 hours

    private boolean apiKeyNotValid() {
        String apiKey = infernoComicsConfig.getComicVineAPIKey();
        if (apiKey == null || apiKey.isEmpty()) {
            log.error("Comic Vine API key not configured. Please set COMIC_VINE_API_KEY environment variable.");
            return true;
        }
        return false;
    }

    // Cache series search results with annotation-based caching
    @Cacheable(value = "comic-vine-series", key = "#query")
    public List<ComicVineSeriesDto> searchSeries(String query) {
        return searchSeriesFromAPI(query);
    }

    // Force refresh series cache
    @CachePut(value = "comic-vine-series", key = "#query")
    public List<ComicVineSeriesDto> refreshSeriesSearch(String query) {
        log.info("Force refreshing series cache for query: {}", query);
        return searchSeriesFromAPI(query).stream().peek(r -> {
                    if (r.getDescription() != null) {
                        r.setDescription(GenericTextCleaner.makeReadable(r.getDescription()));
                    }
                })
                .distinct()
                .collect(Collectors.toList());
    }

    // Cache issues for a series
    @Cacheable(value = "comic-vine-issues", key = "#series.comicVineIds")
    public List<ComicVineIssueDto> searchIssues(Series series) {
        List<String> comicVineIds = series.getComicVineIds();

        if (comicVineIds == null || comicVineIds.isEmpty()) {
            log.warn("No Comic Vine IDs found for series: {}", series.getId());
            return Collections.emptyList();
        }

        List<ComicVineIssueDto> allIssues = comicVineIds.parallelStream()
                .map(this::searchIssuesFromAPI)
                .flatMap(List::stream)
                .peek(r -> {
                    if (r.getDescription() != null) {
                        r.setDescription(GenericTextCleaner.makeReadable(r.getDescription()));
                    }
                })
                .sorted(this::compareIssueNumbers)
                .collect(Collectors.toList());

        log.info("Retrieved {} total issues for series {}", allIssues.size(), series.getId());
        return allIssues;
    }

    // Force refresh issues cache
    @CachePut(value = "comic-vine-issues", key = "#seriesId")
    public List<ComicVineIssueDto> refreshIssuesSearch(String seriesId) {
        log.info("Force refreshing issues cache for series ID: {}", seriesId);
        return searchIssuesFromAPI(seriesId);
    }

    // Clear all Comic Vine caches
    @CacheEvict(value = {"comic-vine-series", "comic-vine-issues"}, allEntries = true)
    public void clearAllComicVineCache() {
        log.info("Cleared all Comic Vine caches");

        try {
            stringRedisTemplate.delete(stringRedisTemplate.keys(SERIES_CACHE_PREFIX + "*"));
            stringRedisTemplate.delete(stringRedisTemplate.keys(ISSUES_CACHE_PREFIX + "*"));
        } catch (Exception e) {
            log.warn("Error clearing manual Comic Vine caches: {}", e.getMessage());
        }
    }

    // Manual caching method for more control
    public List<ComicVineSeriesDto> searchSeriesWithManualCache(String query) {
        String cacheKey = SERIES_CACHE_PREFIX + sanitizeKey(query);

        // Try to get from cache first
        String cachedResult = getCachedResult(cacheKey);
        if (cachedResult != null) {
            try {
                return deserializeSeriesList(cachedResult);
            } catch (Exception e) {
                log.warn("Error deserializing cached series result: {}", e.getMessage());
            }
        }

        // Fetch from API and cache
        List<ComicVineSeriesDto> series = searchSeriesFromAPI(query);
        cacheResult(cacheKey, serializeSeriesList(series));
        return series;
    }

    @Cacheable(value = "comic_vine_issues", key = "#comicVineId", unless = "#result == null")
    public ComicVineIssueDto getComicVineIssueById(Long comicVineId) {
        if (apiKeyNotValid()) return null;

        try {
            String response = webClient.comicVineClient().get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/issue/4000-" + comicVineId + "/")
                            .queryParam("api_key", infernoComicsConfig.getComicVineAPIKey())
                            .queryParam("format", "json")
                            .build())
                    .header("User-Agent", "ComicBookCollectionApp/1.0")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            if (response == null || response.isEmpty()) {
                log.warn("Empty response from Comic Vine API for issue ID: {}", comicVineId);
                return null;
            }

            return parseSingleIssueResponse(response);

        } catch (Exception e) {
            log.error("Error fetching issue from Comic Vine API for ID: {}", comicVineId, e);
            return null;
        }
    }

    @Cacheable(value = "comic_vine_series", key = "#comicVineId", unless = "#result == null")
    public ComicVineSeriesDto getComicVineSeriesById(Long comicVineId) {
        if (apiKeyNotValid()) return null;

        try {
            String response = webClient.comicVineClient().get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/volume/4050-" + comicVineId + "/")
                            .queryParam("api_key", infernoComicsConfig.getComicVineAPIKey())
                            .queryParam("format", "json")
                            .build())
                    .header("User-Agent", "ComicBookCollectionApp/1.0")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            if (response == null || response.isEmpty()) {
                log.warn("Empty response from Comic Vine API for series ID: {}", comicVineId);
                return null;
            }

            return parseSingleSeriesResponse(response);

        } catch (Exception e) {
            log.error("Error fetching series from Comic Vine API for ID: {}", comicVineId, e);
            return null;
        }
    }

    // Internal method that does the actual API call
    private List<ComicVineSeriesDto> searchSeriesFromAPI(String query) {
        if (apiKeyNotValid()) return new ArrayList<>();

        try {
            String response = webClient.comicVineClient().get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/search/")
                            .queryParam("api_key", infernoComicsConfig.getComicVineAPIKey())
                            .queryParam("format", "json")
                            .queryParam("query", query)
                            .queryParam("resources", "volume")
                            .queryParam("limit", "25")
                            .build())
                    .header("User-Agent", "ComicBookCollectionApp/1.0")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            return parseSeriesSearchResponse(response);
        } catch (Exception e) {
            if (e.getMessage().contains("401")) {
                log.error("Comic Vine API authentication failed. Please check your API key.");
            } else {
                log.error("Error searching series: {}", e.getMessage());
            }
            return new ArrayList<>();
        }
    }

    // Internal method for issues API call
    private List<ComicVineIssueDto> searchIssuesFromAPI(String seriesId) {
        if (apiKeyNotValid()) return new ArrayList<>();

        List<ComicVineIssueDto> allIssues = new ArrayList<>();
        int offset = 0;
        int limit = 100;
        boolean hasMoreResults = true;

        while (hasMoreResults) {
            try {
                int finalOffset = offset;
                String response = webClient.comicVineClient().get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/issues/")
                                .queryParam("api_key", infernoComicsConfig.getComicVineAPIKey())
                                .queryParam("format", "json")
                                .queryParam("filter", "volume:" + seriesId)
                                .queryParam("limit", limit)
                                .queryParam("offset", finalOffset)
                                .build())
                        .header("User-Agent", "ComicBookCollectionApp/1.0")
                        .retrieve()
                        .bodyToMono(String.class)
                        .block();

                List<ComicVineIssueDto> pageIssues = parseIssuesResponse(response);
                allIssues.addAll(pageIssues);

                hasMoreResults = pageIssues.size() == limit;
                offset += limit;

                if (hasMoreResults) {
                    Thread.sleep(250); // 250ms delay between requests
                }

            } catch (Exception e) {
                if (e.getMessage().contains("401")) {
                    log.error("Comic Vine API authentication failed. Please check your API key.");
                } else {
                    log.error("Error searching issues at offset {}: {}", offset, e.getMessage());
                }
                break;
            }
        }

        log.info("Fetched {} issues for series {}", allIssues.size(), seriesId);
        return allIssues;
    }

    // Cache utility methods
    private String getCachedResult(String cacheKey) {
        try {
            return stringRedisTemplate.opsForValue().get(cacheKey);
        } catch (Exception e) {
            log.warn("Error retrieving from cache with key {}: {}", cacheKey, e.getMessage());
            return null;
        }
    }

    private void cacheResult(String cacheKey, String result) {
        try {
            stringRedisTemplate.opsForValue().set(cacheKey, result, CACHE_TTL_HOURS, TimeUnit.HOURS);
        } catch (Exception e) {
            log.warn("Error caching result with key {}: {}", cacheKey, e.getMessage());
        }
    }

    private String sanitizeKey(String input) {
        if (input == null) return "null";
        return input.toLowerCase()
                .replaceAll("[^a-z0-9_-]", "_")
                .replaceAll("_{2,}", "_")
                .replaceAll("^_|_$", "");
    }

    // Serialization methods for manual caching
    private String serializeSeriesList(List<ComicVineSeriesDto> series) {
        try {
            return objectMapper.writeValueAsString(series);
        } catch (Exception e) {
            log.error("Error serializing series list: {}", e.getMessage());
            return "[]";
        }
    }

    private List<ComicVineSeriesDto> deserializeSeriesList(String json) {
        try {
            return objectMapper.readValue(json,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, ComicVineSeriesDto.class));
        } catch (Exception e) {
            log.error("Error deserializing series list: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    // Get cache statistics
    public java.util.Map<String, Object> getCacheStats() {
        try {
            long seriesCacheKeys = stringRedisTemplate.keys(SERIES_CACHE_PREFIX + "*").size();
            long issuesCacheKeys = stringRedisTemplate.keys(ISSUES_CACHE_PREFIX + "*").size();

            return java.util.Map.of(
                    "manual_series_cache_count", seriesCacheKeys,
                    "manual_issues_cache_count", issuesCacheKeys,
                    "cache_ttl_hours", CACHE_TTL_HOURS,
                    "annotation_based_caches", java.util.List.of("comic-vine-series", "comic-vine-issues")
            );
        } catch (Exception e) {
            log.warn("Error getting Comic Vine cache stats: {}", e.getMessage());
            return java.util.Map.of("error", "Unable to retrieve cache statistics");
        }
    }

    private List<ComicVineSeriesDto> parseSeriesSearchResponse(String response) {
        List<ComicVineSeriesDto> series = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode results = root.path("results");

            for (JsonNode result : results) {
                String resourceType = result.path("resource_type").asText();
                if (!"volume".equals(resourceType)) {
                    continue;
                }

                ComicVineSeriesDto dto = new ComicVineSeriesDto();
                dto.setId(result.path("id").asText());
                dto.setName(result.path("name").asText());
                dto.setDescription(GenericTextCleaner.makeReadable(result.path("description").asText()));
                dto.setIssueCount(result.path("count_of_issues").asInt());

                JsonNode publisher = result.path("publisher");
                if (!publisher.isMissingNode()) {
                    dto.setPublisher(publisher.path("name").asText());
                }

                dto.setStartYear(result.path("start_year").asInt(0));

                JsonNode image = result.path("image");
                if (!image.isMissingNode()) {
                    dto.setImageUrl(image.path("medium_url").asText());
                }

                series.add(dto);
            }
        } catch (Exception e) {
            log.error("Error parsing series search response: {}", e.getMessage());
        }
        return series;
    }

    private List<ComicVineSeriesDto> parseSeriesResponse(String response) {
        List<ComicVineSeriesDto> series = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode results = root.path("results");

            for (JsonNode result : results) {
                ComicVineSeriesDto dto = new ComicVineSeriesDto();
                dto.setId(result.path("id").asText());
                dto.setName(result.path("name").asText());
                dto.setDescription(result.path("description").asText());
                dto.setPublisher(result.path("publisher").path("name").asText());
                dto.setStartYear(result.path("start_year").asInt(0));

                JsonNode image = result.path("image");
                if (!image.isMissingNode()) {
                    dto.setImageUrl(image.path("medium_url").asText());
                }

                series.add(dto);
            }
        } catch (Exception e) {
            log.error("Error parsing series response: {}", e.getMessage());
        }
        return series;
    }

    private ComicVineSeriesDto parseSingleSeriesResponse(String response) {
        ComicVineSeriesDto dto = new ComicVineSeriesDto();
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode result = root.path("results");

            dto.setId(result.path("id").asText());
            dto.setName(result.path("name").asText());
            dto.setDescription(GenericTextCleaner.makeReadable(result.path("description").asText()));
            dto.setIssueCount(result.path("count_of_issues").asInt());

            JsonNode publisher = result.path("publisher");
            if (!publisher.isMissingNode()) {
                dto.setPublisher(publisher.path("name").asText());
            }

            dto.setStartYear(result.path("start_year").asInt(0));

            JsonNode image = result.path("image");
            if (!image.isMissingNode()) {
                dto.setImageUrl(image.path("medium_url").asText());
            }
        } catch (Exception e) {
            log.error("Error parsing series response: {}", e.getMessage());
        }
        return dto;
    }

    private List<ComicVineIssueDto> parseIssuesResponse(String response) {
        List<ComicVineIssueDto> issues = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode results = root.path("results");

            for (JsonNode result : results) {
                try {
                    ComicVineIssueDto dto = new ComicVineIssueDto();
                    dto.setId(result.path("id").asText());
                    dto.setIssueNumber(result.path("issue_number").asText());
                    dto.setName(result.path("name").asText());
                    dto.setDescription(GenericTextCleaner.makeReadable(result.path("description").asText()));
                    dto.setCoverDate(result.path("cover_date").asText());

                    JsonNode image = result.path("image");
                    if (!image.isMissingNode()) {
                        dto.setImageUrl(image.path("medium_url").asText());
                    }

                    JsonNode associatedImages = result.path("associated_images");
                    if (!associatedImages.isMissingNode() && associatedImages.isArray()) {
                        List<ComicVineIssueDto.VariantCover> variants = new ArrayList<>();

                        for (JsonNode imageNode : associatedImages) {
                            ComicVineIssueDto.VariantCover variant = new ComicVineIssueDto.VariantCover();
                            variant.setId(imageNode.path("id").asText());
                            variant.setOriginalUrl(imageNode.path("original_url").asText());
                            variant.setCaption(imageNode.path("caption").asText());
                            variant.setImageTags(imageNode.path("image_tags").asText());
                            variants.add(variant);
                        }

                        dto.setVariants(variants);
                    }

                    issues.add(dto);

                } catch (Exception e) {
                    log.error("Error processing individual issue: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Error parsing issues response: {}", e.getMessage());
        }

        return issues;
    }

    private ComicVineIssueDto parseSingleIssueResponse(String response) {
        ComicVineIssueDto dto = new ComicVineIssueDto();

        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode result = root.path("results");

            dto.setId(result.path("id").asText());
            dto.setIssueNumber(result.path("issue_number").asText());
            dto.setName(result.path("name").asText());
            dto.setDescription(GenericTextCleaner.makeReadable(result.path("description").asText()));
            dto.setCoverDate(result.path("cover_date").asText());

            JsonNode image = result.path("image");
            if (!image.isMissingNode()) {
                dto.setImageUrl(image.path("medium_url").asText());
            }

            JsonNode associatedImages = result.path("associated_images");
            if (!associatedImages.isMissingNode() && associatedImages.isArray()) {
                List<ComicVineIssueDto.VariantCover> variants = new ArrayList<>();

                for (JsonNode imageNode : associatedImages) {
                    ComicVineIssueDto.VariantCover variant = new ComicVineIssueDto.VariantCover();
                    variant.setId(imageNode.path("id").asText());
                    variant.setOriginalUrl(imageNode.path("original_url").asText());
                    variant.setCaption(imageNode.path("caption").asText());
                    variant.setImageTags(imageNode.path("image_tags").asText());
                    variants.add(variant);
                }

                dto.setVariants(variants);
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return dto;
    }

    private int compareIssueNumbers(ComicVineIssueDto issue1, ComicVineIssueDto issue2) {
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

            // If numeric parts are equal, use publication date as tie-breaker
            if (numericComparison == 0) {
                int dateComparison = compareCoverDates(issue1.getCoverDate(), issue2.getCoverDate());

                // If dates are also equal, compare the full issue number strings
                if (dateComparison == 0) {
                    return num1.compareToIgnoreCase(num2);
                }

                return dateComparison;
            }

            return numericComparison;
        } catch (Exception e) {
            // Fallback to string comparison if parsing fails
            return issue1.getIssueNumber().compareToIgnoreCase(issue2.getIssueNumber());
        }
    }

    private int compareCoverDates(String date1, String date2) {
        try {
            if (date1 == null && date2 == null) return 0;
            if (date1 == null) return 1;
            if (date2 == null) return -1;

            // Parse dates in format "YYYY-MM-DD"
            LocalDate localDate1 = LocalDate.parse(date1);
            LocalDate localDate2 = LocalDate.parse(date2);

            return localDate1.compareTo(localDate2);
        } catch (Exception e) {
            // Fallback to string comparison if date parsing fails
            return date1.compareToIgnoreCase(date2);
        }
    }

    /**
     * Extract numeric part from issue number string
     * Examples: "1" -> 1.0, "1.5" -> 1.5, "1A" -> 1.0, "Annual 1" -> 1.0
     */
    private Double extractNumericPart(String issueNumber) {
        if (issueNumber == null || issueNumber.trim().isEmpty()) {
            return Double.MAX_VALUE; // Put empty/null at the end
        }

        // Remove common prefixes and clean the string
        String cleaned = issueNumber.toLowerCase()
                .replaceAll("^(annual|special|one-shot)\\s*", "")
                .trim();

        // Try to extract the first numeric part
        Pattern pattern = Pattern.compile("^(\\d+(?:\\.\\d+)?)");
        Matcher matcher = pattern.matcher(cleaned);

        if (matcher.find()) {
            try {
                return Double.parseDouble(matcher.group(1));
            } catch (NumberFormatException e) {
                // If parsing fails, use a hash of the string for consistent ordering
                return (double) issueNumber.hashCode();
            }
        }

        // If no numeric part found, use a hash for consistent ordering
        return (double) issueNumber.hashCode();
    }

    @Setter
    @Getter
    public static class ComicVineSeriesDto {
        private String id;
        private String name;
        private String description;
        private Integer issueCount;
        private String publisher;
        private Integer startYear;
        private Integer endYear;
        private String imageUrl;
        private boolean generatedDescription;
    }

    @Setter
    @Getter
    @ToString
    public static class ComicVineIssueDto {
        private String id;
        private String issueNumber;
        private String name;
        private String description;
        private String coverDate;
        private String imageUrl;
        private List<VariantCover> variants;
        private boolean generatedDescription;
        private boolean isVariant;

        @Data
        @NoArgsConstructor
        @AllArgsConstructor
        public static class VariantCover {
            private String id;
            private String originalUrl;
            private String caption;
            private String imageTags;
        }
    }
}