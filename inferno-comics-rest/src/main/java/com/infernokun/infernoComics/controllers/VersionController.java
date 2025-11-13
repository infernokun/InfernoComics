package com.infernokun.infernoComics.controllers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@RestController
@RequestMapping("/api/version")
public class VersionController {

    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final String appVersion;
    private final String appName;

    public VersionController(InfernoComicsConfig infernoComicsConfig, ObjectMapper objectMapper) {
        this.webClient = WebClient.builder()
                .baseUrl("http://" + infernoComicsConfig.getRecognitionServerHost() + ":" + infernoComicsConfig.getRecognitionServerPort() + "/inferno-comics-recognition/api/v1")
                .build();
        this.objectMapper = objectMapper;

        // Read version from package.json on startup
        Map<String, String> packageInfo = readPackageJson();
        this.appName = packageInfo.get("name");
        this.appVersion = packageInfo.get("version");
    }

    @GetMapping
    public List<Map<String, String>> getVersion() {
        // Get REST service version
        Map<String, String> restVersion = new HashMap<>();
        restVersion.put("name", appName);
        restVersion.put("version", appVersion);

        // Get Recognition service version
        Map<String, String> recogVersion = getRecognitionVersion();

        return List.of(restVersion, recogVersion);
    }

    private Map<String, String> readPackageJson() {
        Map<String, String> result = new HashMap<>();

        try {
            // Read from project root
            java.io.File packageFile = new java.io.File("package.json");
            if (packageFile.exists()) {
                JsonNode packageJson = objectMapper.readTree(packageFile);
                result.put("name", packageJson.path("name").asText("inferno-comics-rest"));
                result.put("version", packageJson.path("version").asText("unknown"));
                log.info("Loaded version {} from package.json", result.get("version"));
                return result;
            } else {
                log.warn("package.json not found at: {}", packageFile.getAbsolutePath());
            }
        } catch (IOException e) {
            log.warn("Could not read package.json: {}", e.getMessage());
        }

        // Fallback to defaults
        result.put("name", "inferno-comics-rest");
        result.put("version", "unknown");
        return result;
    }

    private Map<String, String> getRecognitionVersion() {
        try {
            Map<String, Object> healthResponse = webClient.get()
                    .uri("/health")
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                    .timeout(Duration.ofSeconds(5))
                    .block();

            String version = Optional.ofNullable(healthResponse)
                    .map(response -> response.get("version"))
                    .map(Object::toString)
                    .orElse("unavailable");

            Map<String, String> result = new HashMap<>();
            result.put("name", "inferno-comics-recog");
            result.put("version", version);
            return result;

        } catch (Exception e) {
            log.warn("Failed to fetch recognition service version: {}", e.getMessage());
            Map<String, String> fallback = new HashMap<>();
            fallback.put("name", "inferno-comics-recog");
            fallback.put("version", "unavailable");
            return fallback;
        }
    }
}