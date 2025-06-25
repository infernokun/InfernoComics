package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import lombok.extern.slf4j.Slf4j;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Service
@Slf4j
public class ComicVineService {

    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final InfernoComicsConfig infernoComicsConfig;
    private final DescriptionGeneratorService descriptionGeneratorService;

    private static final String BASE_URL = "https://comicvine.gamespot.com/api";

    public ComicVineService(InfernoComicsConfig infernoComicsConfig, DescriptionGeneratorService descriptionGeneratorService) {
        this.infernoComicsConfig = infernoComicsConfig;
        this.descriptionGeneratorService = descriptionGeneratorService;
        this.webClient = WebClient.builder()
                .baseUrl(BASE_URL)
                .build();
        this.objectMapper = new ObjectMapper();
    }

    public List<ComicVineSeriesDto> searchSeries(String query) {
        String apiKey = infernoComicsConfig.getComicVineAPIKey();

        // Debug logging
        log.info("API Key configured: {}", apiKey != null && !apiKey.isEmpty() ? "YES" : "NO");
        if (apiKey != null && !apiKey.isEmpty()) {
            log.info("API Key length: {}", apiKey.length());
            log.info("API Key starts with: {}", apiKey.substring(0, Math.min(5, apiKey.length())) + "...");
        }

        if (apiKey == null || apiKey.isEmpty()) {
            log.error("Comic Vine API key not configured. Please set COMIC_VINE_API_KEY environment variable.");
            return new ArrayList<>();
        }

        try {
            String url = String.format("%s/search/?api_key=%s&format=json&query=%s&resources=volume&limit=10",
                    BASE_URL, apiKey, query);
            log.info("Calling Comic Vine API: {}", url.replace(apiKey, "***"));

            String response = webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/search/")
                            .queryParam("api_key", apiKey)
                            .queryParam("format", "json")
                            .queryParam("query", query)
                            .queryParam("resources", "volume")
                            .queryParam("limit", "10")
                            .build())
                    .header("User-Agent", "ComicBookCollectionApp/1.0")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            return parseSeriesSearchResponse(response);
        } catch (Exception e) {
            log.error("Full error details: ", e);
            if (e.getMessage().contains("401")) {
                log.error("Comic Vine API authentication failed. Please check your API key.");
            } else {
                log.error("Error searching series: {}", e.getMessage());
            }
            return new ArrayList<>();
        }
    }

    public List<ComicVineIssueDto> searchIssues(String seriesId) {
        String apiKey = infernoComicsConfig.getComicVineAPIKey();
        if (apiKey == null || apiKey.isEmpty()) {
            log.error("Comic Vine API key not configured. Please set COMIC_VINE_API_KEY environment variable.");
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
                            .queryParam("sort", "issue_number:asc")
                            .build())
                    .header("User-Agent", "ComicBookCollectionApp/1.0")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            return parseIssuesResponse(response);
        } catch (Exception e) {
            if (e.getMessage().contains("401")) {
                log.error("Comic Vine API authentication failed. Please check your API key.");
            } else {
                log.error("Error searching issues: {}", e.getMessage());
            }
            return new ArrayList<>();
        }
    }


    private List<ComicVineSeriesDto> parseSeriesSearchResponse(String response) {
        List<ComicVineSeriesDto> series = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(response);

            // Debug logging
            log.info("Comic Vine API Response Status: {}", root.path("status_code").asText());
            log.info("Number of results: {}", root.path("number_of_total_results").asText());

            JsonNode results = root.path("results");

            for (JsonNode result : results) {
                // Only process volume resources
                String resourceType = result.path("resource_type").asText();
                log.debug("Processing resource type: {}", resourceType);

                if (!"volume".equals(resourceType)) {
                    continue;
                }

                ComicVineSeriesDto dto = new ComicVineSeriesDto();
                dto.setId(result.path("id").asText());
                dto.setName(result.path("name").asText());
                dto.setDescription(result.path("deck").asText());

                JsonNode publisher = result.path("publisher");
                if (!publisher.isMissingNode()) {
                    dto.setPublisher(publisher.path("name").asText());
                }

                dto.setStartYear(result.path("start_year").asInt(0));

                JsonNode image = result.path("image");
                if (!image.isMissingNode()) {
                    dto.setImageUrl(image.path("medium_url").asText());
                }

                log.debug("Added series: {}", dto.getName());
                series.add(dto);
                log.error("old desc: {}", dto.getDescription());
                if (dto.getDescription() == null || dto.getDescription().equals("null") || dto.getDescription().trim().isEmpty()) {
                    dto.setDescription(descriptionGeneratorService.callLLMAPI(buildSeriesPrompt(dto)));
                    log.error("new desc: {}", dto.getDescription());
                }
            }

            log.info("Total series parsed: {}", series.size());
        } catch (Exception e) {
            log.error("Error parsing series search response: {}", e.getMessage(), e);
        }
        return series;
    }

    private String buildSeriesPrompt(ComicVineService.ComicVineSeriesDto dto) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Generate a concise, engaging description for this comic book series:\n\n");
        prompt.append("Series: ").append(dto.getName()).append("\n");
        if (dto.getPublisher() != null && !dto.getPublisher().isEmpty()) {
            prompt.append("Title: ").append(dto.getPublisher()).append("\n");
        }

        if (dto.getStartYear() != null) {
            prompt.append("Cover Date: ").append(dto.getStartYear()).append("\n");
        }

        prompt.append("\nWrite a 2-3 sentence description that captures what might happen in this issue. ");
        prompt.append("Focus on action, characters, and plot elements typical for this series. ");
        prompt.append("Keep it engaging but concise (under 150 words). ");
        prompt.append("Do not include publication details or meta information.");

        return prompt.toString();
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
            log.error("Error parsing series response: {}", e.getMessage(), e);
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

            // Sort by issue number
            issues.sort((issue1, issue2) -> {
                try {
                    // Try to parse as integers for proper numeric sorting
                    String num1 = issue1.getIssueNumber();
                    String num2 = issue2.getIssueNumber();

                    // Handle null or empty issue numbers
                    if (num1 == null || num1.isEmpty()) return 1;
                    if (num2 == null || num2.isEmpty()) return -1;

                    // Extract numeric part for comparison (handles cases like "1", "1.1", "1A", etc.)
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
                    return issue1.getIssueNumber().compareToIgnoreCase(issue2.getIssueNumber());
                }
            });

        } catch (Exception e) {
            log.error("Error parsing issues response: {}", e.getMessage(), e);
        }
        return issues;
    }

    private Double extractNumericPart(String issueNumber) {
        try {
            // Remove leading/trailing whitespace
            String cleaned = issueNumber.trim();

            // Extract the numeric part (handles decimals)
            String numericPart = cleaned.replaceAll("[^0-9.]", "");

            // If we have a valid numeric string, parse it
            if (!numericPart.isEmpty() && !numericPart.equals(".")) {
                return Double.parseDouble(numericPart);
            }

            // If no numeric part found, return a high value to sort to end
            return Double.MAX_VALUE;
        } catch (NumberFormatException e) {
            // If parsing fails, return a high value to sort to end
            return Double.MAX_VALUE;
        }
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