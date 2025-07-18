package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.Issue;
import com.infernokun.infernoComics.models.DescriptionGenerated;
import com.infernokun.infernoComics.models.Series;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.http.MediaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import reactor.core.publisher.Mono;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class DescriptionGeneratorService {

    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final InfernoComicsConfig infernoComicsConfig;
    private final StringRedisTemplate stringRedisTemplate;

    private final String apiUrl = "https://api.groq.com/openai/v1/chat/completions";
    private static final String MANUAL_CACHE_KEY_PREFIX = "issue_description_manual:";
    private static final long CACHE_TTL_HOURS = 24 * 7; // Cache for 7 days

    public DescriptionGeneratorService(ObjectMapper objectMapper,
                                       InfernoComicsConfig infernoComicsConfig,
                                       StringRedisTemplate stringRedisTemplate,
                                       RedisTemplate<String, Object> redisTemplate) {
        this.webClient = WebClient.builder()
                .baseUrl(apiUrl)
                .exchangeStrategies(ExchangeStrategies.builder()
                        .codecs(configurer -> configurer
                                .defaultCodecs()
                                .maxInMemorySize(1024 * 1024))
                        .build())
                .build();
        this.objectMapper = objectMapper;
        this.infernoComicsConfig = infernoComicsConfig;
        this.stringRedisTemplate = stringRedisTemplate;
    }

    // Annotation-based caching approach (recommended for most use cases)
    @Cacheable(value = "issue-descriptions", key = "#seriesName + ':' + #issueNumber + ':' + (#issueTitle ?: 'no_title')")
    public DescriptionGenerated generateDescription(String seriesName, String issueNumber, String issueTitle, String coverDate, String description) {
        log.debug("Generating description for {}, Issue #{}: {}", seriesName, issueNumber, issueTitle);

        if (description != null && !description.trim().isEmpty() && !description.equals("null")) {
            return new DescriptionGenerated(description, false);
        }

        if (!infernoComicsConfig.isDescriptionGeneration()) {
            return new DescriptionGenerated(generateFallbackDescription(seriesName, issueNumber, issueTitle, coverDate), false);
        }

        final String apiKey = infernoComicsConfig.getGroqAPIKey();
        try {
            if (apiKey.isEmpty()) {
                log.warn("No API key configured for description generator");
                return new DescriptionGenerated(generateFallbackDescription(seriesName, issueNumber, issueTitle, coverDate), false);

            }
            String prompt = buildPrompt(seriesName, issueNumber, issueTitle, coverDate);
            String response = callLLMAPI(prompt);

            if (response != null && !response.isEmpty()) {
                return new DescriptionGenerated(response.trim(), true);
            } else {
                return new DescriptionGenerated(generateFallbackDescription(seriesName, issueNumber, issueTitle, coverDate), false);
            }

        } catch (Exception e) {
            log.error("Error generating description: {}", e.getMessage());
            return new DescriptionGenerated(generateFallbackDescription(seriesName, issueNumber, issueTitle, coverDate), false);
        }
    }

    // Manual cache approach for more control
    public String generateDescriptionWithManualCache(String seriesName, String issueNumber, String issueTitle, String coverDate) {
        // Generate cache key
        String cacheKey = generateManualCacheKey(seriesName, issueNumber, issueTitle);

        // Try to get from cache first
        String cachedDescription = getFromManualCache(cacheKey);
        if (cachedDescription != null) {
            log.debug("Retrieved description from manual cache for key: {}", cacheKey);
            return cachedDescription;
        }

        // Generate new description
        String description = generateDescriptionInternal(seriesName, issueNumber, issueTitle, coverDate);

        // Cache the result
        cacheInManualCache(cacheKey, description);

        return description;
    }

    // Force refresh cache with new description
    @CachePut(value = "issue-descriptions", key = "#seriesName + ':' + #issueNumber + ':' + (#issueTitle ?: 'no_title')")
    public String refreshDescription(String seriesName, String issueNumber, String issueTitle, String coverDate) {
        log.info("Force refreshing description for {}, Issue #{}: {}", seriesName, issueNumber, issueTitle);
        return generateDescriptionInternal(seriesName, issueNumber, issueTitle, coverDate);
    }

    // Remove from cache
    @CacheEvict(value = "issue-descriptions", key = "#seriesName + ':' + #issueNumber + ':' + (#issueTitle ?: 'no_title')")
    public void invalidateDescription(String seriesName, String issueNumber, String issueTitle) {
        log.info("Invalidated cache for {}, Issue #{}: {}", seriesName, issueNumber, issueTitle);

        // Also remove from manual cache
        String manualCacheKey = generateManualCacheKey(seriesName, issueNumber, issueTitle);
        stringRedisTemplate.delete(manualCacheKey);
    }

    // Clear all description caches
    @CacheEvict(value = "issue-descriptions", allEntries = true)
    public void clearAllDescriptionCache() {
        log.info("Cleared all annotation-based description caches");

        // Also clear manual caches
        try {
            stringRedisTemplate.delete(stringRedisTemplate.keys(MANUAL_CACHE_KEY_PREFIX + "*"));
            log.info("Cleared all manual description caches");
        } catch (Exception e) {
            log.warn("Error clearing manual description caches: {}", e.getMessage());
        }
    }

    // Internal method that does the actual work (no caching)
    private String generateDescriptionInternal(String seriesName, String issueNumber, String issueTitle, String coverDate) {
        final String apiKey = infernoComicsConfig.getGroqAPIKey();
        try {
            if (apiKey.isEmpty()) {
                log.warn("No API key configured for description generator");
                return generateFallbackDescription(seriesName, issueNumber, issueTitle, coverDate);
            }

            String prompt = buildPrompt(seriesName, issueNumber, issueTitle, coverDate);
            String response = callLLMAPI(prompt);

            if (response != null && !response.isEmpty()) {
                return response.trim();
            } else {
                return generateFallbackDescription(seriesName, issueNumber, issueTitle, coverDate);
            }

        } catch (Exception e) {
            log.error("Error generating description: {}", e.getMessage());
            return generateFallbackDescription(seriesName, issueNumber, issueTitle, coverDate);
        }
    }

    // Manual cache methods for fine-grained control
    private String generateManualCacheKey(String seriesName, String issueNumber, String issueTitle) {
        StringBuilder keyBuilder = new StringBuilder(MANUAL_CACHE_KEY_PREFIX);
        keyBuilder.append(sanitizeForKey(seriesName)).append(":");
        keyBuilder.append(sanitizeForKey(issueNumber)).append(":");

        if (issueTitle != null && !issueTitle.isEmpty()) {
            keyBuilder.append(sanitizeForKey(issueTitle));
        } else {
            keyBuilder.append("no_title");
        }

        return keyBuilder.toString();
    }

    private String sanitizeForKey(String input) {
        if (input == null) return "null";
        return input.toLowerCase()
                .replaceAll("[^a-z0-9_-]", "_")
                .replaceAll("_{2,}", "_")
                .replaceAll("^_|_$", "");
    }

    private String getFromManualCache(String cacheKey) {
        try {
            return stringRedisTemplate.opsForValue().get(cacheKey);
        } catch (Exception e) {
            log.warn("Error retrieving from manual cache with key {}: {}", cacheKey, e.getMessage());
            return null;
        }
    }

    private void cacheInManualCache(String cacheKey, String description) {
        try {
            stringRedisTemplate.opsForValue().set(cacheKey, description, CACHE_TTL_HOURS, TimeUnit.HOURS);
            log.debug("Cached description in manual cache with key: {}", cacheKey);
        } catch (Exception e) {
            log.warn("Error caching description in manual cache with key {}: {}", cacheKey, e.getMessage());
        }
    }

    // Method to get comprehensive cache statistics
    public Map<String, Object> getCacheStats() {
        try {
            long manualCacheKeys = stringRedisTemplate.keys(MANUAL_CACHE_KEY_PREFIX + "*").size();

            // You could also get annotation-based cache stats if needed
            // This would require injecting CacheManager and iterating through caches

            return Map.of(
                    "manual_cached_descriptions", manualCacheKeys,
                    "manual_cache_key_prefix", MANUAL_CACHE_KEY_PREFIX,
                    "cache_ttl_hours", CACHE_TTL_HOURS,
                    "annotation_based_caches", List.of("issue-descriptions", "issue-metadata", "series-info", "user-collections")
            );
        } catch (Exception e) {
            log.warn("Error getting cache stats: {}", e.getMessage());
            return Map.of("error", "Unable to retrieve cache statistics");
        }
    }

    // Batch processing with smart caching strategy
    public void generateDescriptionsForIssues(List<Issue> issues) {
        int annotationCacheHits = 0;
        int apiCalls = 0;

        for (Issue issue : issues) {
            if (issue.getDescription() == null || issue.getDescription().isEmpty()) {
                try {
                    // Use annotation-based caching for batch processing
                    DescriptionGenerated descriptionGenerated = generateDescription(
                            issue.getSeries() != null ? issue.getSeries().getName() : "Unknown Series",
                            issue.getIssueNumber(),
                            issue.getTitle(),
                            issue.getCoverDate() != null ? issue.getCoverDate().toString() : null,
                            issue.getDescription()
                    );

                    issue.setDescription(descriptionGenerated.getDescription());

                    // Only add delay if we actually made an API call (not a cache hit)
                    // You can determine this by checking if the method was actually executed
                    // For now, we'll add a small delay to be safe
                    Thread.sleep(100); // Reduced delay since many will be cache hits

                } catch (Exception e) {
                    log.error("Error generating description for issue {}: {}", issue.getId(), e.getMessage());
                }
            }
        }

        log.info("Batch processing completed for {} issues", issues.size());
    }

    // Cache issue entities
    @Cacheable(value = "issue-metadata", key = "#issueId")
    public Issue getIssueMetadata(Long issueId) {
        log.debug("Fetching metadata for issue ID: {}", issueId);
        // This would typically call your IssueRepository
        // For now, this is a placeholder - implement with your actual repository
        return null; // Replace with actual repository call
    }

    // Cache series information
    @Cacheable(value = "series-info", key = "#seriesName")
    public Series getSeriesInfo(String seriesName) {
        log.debug("Fetching series info for: {}", seriesName);
        // This would typically call your SeriesRepository
        // For now, this is a placeholder - implement with your actual repository
        return null; // Replace with actual repository call
    }

    // Cache eviction when issue is updated
    @CacheEvict(value = {"issue-descriptions", "issue-metadata"}, key = "#issue.series.name + ':' + #issue.issueNumber + ':' + (#issue.title ?: 'no_title')")
    public void evictIssueCache(Issue issue) {
        log.info("Evicted cache for issue: {} #{}", issue.getSeries().getName(), issue.getIssueNumber());
    }

    // Cache eviction when series is updated
    @CacheEvict(value = "series-info", key = "#series.name")
    public void evictSeriesCache(Series series) {
        log.info("Evicted cache for series: {}", series.getName());
    }

    private String buildPrompt(String seriesName, String issueNumber, String issueTitle, String coverDate) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Generate a concise, engaging description for this comic book issue:\n\n");
        prompt.append("Series: ").append(seriesName).append("\n");
        prompt.append("Issue #: ").append(issueNumber).append("\n");

        if (issueTitle != null && !issueTitle.isEmpty()) {
            prompt.append("Title: ").append(issueTitle).append("\n");
        }

        if (coverDate != null && !coverDate.isEmpty()) {
            prompt.append("Cover Date: ").append(coverDate).append("\n");
        }

        prompt.append("\nWrite a 2-3 sentence description that captures what might happen in this issue. ");
        prompt.append("Focus on action, characters, and plot elements typical for this series. ");
        prompt.append("Keep it engaging but concise (under 150 words). ");
        prompt.append("Do not include publication details or meta information.");

        return prompt.toString();
    }

    String callLLMAPI(String prompt) {
        try {
            // Build request body
            Map<String, Object> requestBody = Map.of(
                    "model", infernoComicsConfig.getGroqModel(),
                    "messages", java.util.List.of(
                            Map.of("role", "system", "content",
                                    "You are a comic book expert who writes engaging, concise descriptions for comic book issues. " +
                                            "Keep descriptions under 150 words and focus on plot and characters."),
                            Map.of("role", "user", "content", prompt)
                    ),
                    "max_tokens", 200,
                    "temperature", 0.7
            );

            // Make WebClient call
            Mono<String> responseMono = webClient.post()
                    .uri(apiUrl)
                    .header("Authorization", "Bearer " + infernoComicsConfig.getGroqAPIKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(30))
                    .doOnError(WebClientResponseException.class, ex -> log.error("WebClient error: Status={}, Body={}", ex.getStatusCode(), ex.getResponseBodyAsString()))
                    .onErrorReturn(""); // Return empty string on error

            String responseBody = responseMono.block(); // Block for synchronous behavior

            if (responseBody != null && !responseBody.isEmpty()) {
                JsonNode responseJson = objectMapper.readTree(responseBody);
                JsonNode choices = responseJson.path("choices");

                if (choices.isArray() && !choices.isEmpty()) {
                    return choices.get(0).path("message").path("content").asText();
                }
            }

        } catch (Exception e) {
            log.error("Error calling LLM API: {}", e.getMessage());
        }

        return null;
    }

    private String generateFallbackDescription(String seriesName, String issueNumber, String issueTitle, String coverDate) {
        StringBuilder fallback = new StringBuilder();

        if (issueTitle != null && !issueTitle.isEmpty()) {
            fallback.append("In \"").append(issueTitle).append("\", ");
        } else {
            fallback.append("In issue #").append(issueNumber).append(" of ").append(seriesName).append(", ");
        }

        fallback.append("the story continues with new adventures and challenges. ");
        fallback.append("This issue promises exciting developments in the ongoing narrative.");

        if (coverDate != null && !coverDate.isEmpty()) {
            fallback.append(" Published ").append(coverDate).append(".");
        }

        return fallback.toString();
    }
}