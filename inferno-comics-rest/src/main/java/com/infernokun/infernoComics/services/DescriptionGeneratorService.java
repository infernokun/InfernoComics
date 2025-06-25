package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.models.ComicBook;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class DescriptionGeneratorService {

    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final InfernoComicsConfig infernoComicsConfig;

    @Value("${description.generator.api.url:https://api.groq.com/openai/v1/chat/completions}")
    private String apiUrl;

    public DescriptionGeneratorService(ObjectMapper objectMapper, InfernoComicsConfig infernoComicsConfig) {
        this.webClient = WebClient.builder()
                .baseUrl(apiUrl)
                .build();
        this.objectMapper = objectMapper;
        this.infernoComicsConfig = infernoComicsConfig;
    }

    public String generateDescription(String seriesName, String issueNumber, String issueTitle, String coverDate) {
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
                    .doOnError(WebClientResponseException.class, ex -> {
                        log.error("WebClient error: Status={}, Body={}", ex.getStatusCode(), ex.getResponseBodyAsString());
                    })
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

    // Batch processing method for multiple comics
    public void generateDescriptionsForComics(List<ComicBook> comics) {
        for (ComicBook comic : comics) {
            if (comic.getDescription() == null || comic.getDescription().isEmpty()) {
                try {
                    String description = generateDescription(
                            comic.getSeries() != null ? comic.getSeries().getName() : "Unknown Series",
                            comic.getIssueNumber(),
                            comic.getTitle(),
                            comic.getCoverDate().toString()
                    );

                    comic.setDescription(description);
                    Thread.sleep(1000); // Rate limiting - 1 second between requests

                } catch (Exception e) {
                    log.error("Error generating description for comic {}: {}", comic.getId(), e.getMessage());
                }
            }
        }
    }
}