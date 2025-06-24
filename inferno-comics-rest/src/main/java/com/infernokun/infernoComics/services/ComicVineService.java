package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import lombok.Getter;
import lombok.Setter;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.List;

@Service
public class ComicVineService {

    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    private final InfernoComicsConfig infernoComicsConfig;

    private static final String BASE_URL = "https://comicvine.gamespot.com/api";

    public ComicVineService(InfernoComicsConfig infernoComicsConfig) {
        this.infernoComicsConfig = infernoComicsConfig;
        this.webClient = WebClient.builder()
                .baseUrl(BASE_URL)
                .build();
        this.objectMapper = new ObjectMapper();
    }

    public List<ComicVineSeriesDto> searchSeries(String query) {
        String apiKey = infernoComicsConfig.getApiKey();
        if (apiKey == null || apiKey.isEmpty()) {
            return new ArrayList<>();
        }

        try {
            String response = webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/volumes/")
                            .queryParam("api_key", apiKey)
                            .queryParam("format", "json")
                            .queryParam("filter", "name:" + query)
                            .queryParam("limit", "10")
                            .build())
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            return parseSeriesResponse(response);
        } catch (Exception e) {
            System.err.println("Error searching series: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    public List<ComicVineIssueDto> searchIssues(String seriesId) {
        String apiKey = infernoComicsConfig.getApiKey();
        if (apiKey == null || apiKey.isEmpty()) {
            return new ArrayList<>();
        }

        try {
            String response = webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/issues/")
                            .queryParam("api_key", apiKey)
                            .queryParam("format", "json")
                            .queryParam("filter", "volume:" + seriesId)
                            .queryParam("limit", "100")
                            .build())
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            return parseIssuesResponse(response);
        } catch (Exception e) {
            System.err.println("Error searching issues: " + e.getMessage());
            return new ArrayList<>();
        }
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
                dto.setDescription(result.path("deck").asText());
                dto.setPublisher(result.path("publisher").path("name").asText());
                dto.setStartYear(result.path("start_year").asInt(0));

                JsonNode image = result.path("image");
                if (!image.isMissingNode()) {
                    dto.setImageUrl(image.path("medium_url").asText());
                }

                series.add(dto);
            }
        } catch (Exception e) {
            System.err.println("Error parsing series response: " + e.getMessage());
        }
        return series;
    }

    private List<ComicVineIssueDto> parseIssuesResponse(String response) {
        List<ComicVineIssueDto> issues = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode results = root.path("results");

            for (JsonNode result : results) {
                ComicVineIssueDto dto = new ComicVineIssueDto();
                dto.setId(result.path("id").asText());
                dto.setIssueNumber(result.path("issue_number").asText());
                dto.setName(result.path("name").asText());
                dto.setDescription(result.path("deck").asText());
                dto.setCoverDate(result.path("cover_date").asText());

                JsonNode image = result.path("image");
                if (!image.isMissingNode()) {
                    dto.setImageUrl(image.path("medium_url").asText());
                }

                issues.add(dto);
            }
        } catch (Exception e) {
            System.err.println("Error parsing issues response: " + e.getMessage());
        }
        return issues;
    }

    @Setter
    @Getter
    public static class ComicVineSeriesDto {
        private String id;
        private String name;
        private String description;
        private String publisher;
        private Integer startYear;
        private String imageUrl;

    }

    @Setter
    @Getter
    public static class ComicVineIssueDto {
        private String id;
        private String issueNumber;
        private String name;
        private String description;
        private String coverDate;
        private String imageUrl;
    }
}