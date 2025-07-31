package com.infernokun.infernoComics.services.gcd;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;

@Slf4j
@Service
public class GCDAPIService {

    private final WebClient webClient;
    private String sessionCookie;
    private String csrfToken;

    private static final String BASE_URL = "https://www.comics.org";
    private static final String API_BASE_URL = "https://www.comics.org/api";

    @Autowired
    public GCDAPIService(WebClient.Builder webClientBuilder) {

        // Web client for authentication (main site)
        this.webClient = webClientBuilder
                .baseUrl(BASE_URL)
                .defaultHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .defaultHeader("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .defaultHeader("Accept-Language", "en-US,en;q=0.9")
                .build();
    }

    // Enhanced API methods with better error handling
    public Mono<SeriesResponse> getSeriesById(Long seriesId) {
        return webClient.get()
                .uri("/series/{id}/", seriesId)
                .retrieve()
                .bodyToMono(SeriesResponse.class)
                .doOnError(error -> log.error("Error fetching series {}: {}", seriesId, error.getMessage()))
                .doOnNext(response -> log.debug("Successfully fetched series: {}", response.getName()));
    }

    public Mono<IssueResponse> getIssueById(Long issueId) {
        return webClient.get()
                .uri("/issue/{id}/", issueId)
                .retrieve()
                .bodyToMono(IssueResponse.class)
                .doOnError(error -> log.error("Error fetching issue {}: {}", issueId, error.getMessage()))
                .doOnNext(response -> log.debug("Successfully fetched issue: {}", response.getSeriesName()));
    }

    @Data
    public static class SeriesResponse {
        @JsonProperty("api_url")
        private String apiUrl;
        private String name;
        private String country;
        private String language;
        @JsonProperty("active_issues")
        private List<String> activeIssues;
        @JsonProperty("issue_descriptors")
        private List<String> issueDescriptors;
        private String color;
        private String dimensions;
        @JsonProperty("paper_stock")
        private String paperStock;
        private String binding;
        @JsonProperty("publishing_format")
        private String publishingFormat;
        private String notes;
        @JsonProperty("year_began")
        private Integer yearBegan;
        @JsonProperty("year_ended")
        private Integer yearEnded;
        private String publisher;
    }

    @Data
    public static class IssueResponse {
        @JsonProperty("api_url")
        private String apiUrl;
        @JsonProperty("series_name")
        private String seriesName;
        private String descriptor;
        @JsonProperty("publication_date")
        private String publicationDate;
        private String price;
        @JsonProperty("page_count")
        private String pageCount;
        private String editing;
        @JsonProperty("indicia_publisher")
        private String indiciaPublisher;
        private String brand;
        private String isbn;
        private String barcode;
        private String rating;
        @JsonProperty("on_sale_date")
        private String onSaleDate;
        @JsonProperty("indicia_frequency")
        private String indiciaFrequency;
        private String notes;
        @JsonProperty("variant_of")
        private String variantOf;
        private String series;
        @JsonProperty("story_set")
        private List<Story> storySet;
        private String cover; // This might contain cover information!

        // Additional fields that might be present with authentication
        @JsonProperty("cover_set")
        private List<String> coverSet;
        @JsonProperty("active_covers")
        private List<String> activeCovers;
    }

    @Data
    public static class Story {
        private String type;
        private String title;
        private String feature;
        @JsonProperty("sequence_number")
        private Integer sequenceNumber;
        @JsonProperty("page_count")
        private String pageCount;
        private String script;
        private String pencils;
        private String inks;
        private String colors;
        private String letters;
        private String editing;
        @JsonProperty("job_number")
        private String jobNumber;
        private String genre;
        private String characters;
        private String synopsis;
        private String notes;
    }

    // Utility methods
    public Mono<List<Long>> getIssueIdsFromSeries(Long seriesId) {
        return getSeriesById(seriesId)
                .map(series -> series.getActiveIssues().stream()
                        .map(this::extractIdFromUrl)
                        .toList());
    }

    private Long extractIdFromUrl(String url) {
        // Extract ID from URL like "https://www.comics.org/api/issue/1581813/"
        String[] parts = url.split("/");
        return Long.valueOf(parts[parts.length - 2]);
    }

    public Mono<String> getSeriesNameById(Long seriesId) {
        return getSeriesById(seriesId)
                .map(SeriesResponse::getName);
    }

    public Mono<Integer> getIssueCountForSeries(Long seriesId) {
        return getSeriesById(seriesId)
                .map(series -> series.getActiveIssues().size());
    }
}