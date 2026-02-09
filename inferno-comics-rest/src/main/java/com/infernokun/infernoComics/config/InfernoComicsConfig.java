package com.infernokun.infernoComics.config;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@NoArgsConstructor
@AllArgsConstructor
@ConfigurationProperties(prefix = "inferno-comics")
public class InfernoComicsConfig {
    private String applicationName;
    private String defaultAdminUsername;
    private String defaultAdminPassword;
    private String encryptionKey;

    private String comicVineAPIKey;

    private String groqAPIKey;
    private String groqModel;

    private boolean descriptionGeneration;

    private String recognitionServerHost;
    private int recognitionServerPort;

    private boolean skipScrape;

    private String gcdUsername;
    private String gcdPassword;

    private String nextcloudUrl;
    private String nextcloudUsername;
    private String nextcloudPassword;
    private String nextcloudFolderLocation;

    private String searxngHost;
}
