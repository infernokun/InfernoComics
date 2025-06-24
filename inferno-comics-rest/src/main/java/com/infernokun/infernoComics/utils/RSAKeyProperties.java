package com.infernokun.infernoComics.utils;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

@Slf4j
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "rsa")
public class RSAKeyProperties {

    private String privateKey;
    private String publicKey;

    // Cache the loaded keys to avoid repeated file operations
    private RSAPrivateKey cachedPrivateKey;
    private RSAPublicKey cachedPublicKey;

    public RSAKeyProperties() {}

    public RSAKeyProperties(String privateKey, String publicKey) {
        this.privateKey = privateKey;
        this.publicKey = publicKey;
    }


     // Get RSAPrivateKey, loading from file if not cached
    public RSAPrivateKey getPrivateKey() {
        if (cachedPrivateKey == null) {
            cachedPrivateKey = loadPrivateKeyFromFile();
        }
        return cachedPrivateKey;
    }

     // Get RSAPublicKey, loading from file if not cached
    public RSAPublicKey getPublicKey() {
        if (cachedPublicKey == null) {
            cachedPublicKey = loadPublicKeyFromFile();
        }
        return cachedPublicKey;
    }

     // Load and parse private key from file
    private RSAPrivateKey loadPrivateKeyFromFile() {
        try {
            log.debug("Loading private key from: {}", privateKey);
            String privateKeyContent = loadKeyContent(privateKey);

            // Clean the key content
            String cleanedKey = cleanKeyContent(privateKeyContent, "PRIVATE KEY");

            // Parse the key
            byte[] keyBytes = Base64.getDecoder().decode(cleanedKey);
            PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(keyBytes);
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");

            RSAPrivateKey key = (RSAPrivateKey) keyFactory.generatePrivate(spec);
            log.info("Successfully loaded private key");
            return key;

        } catch (Exception e) {
            log.error("Failed to load private key from: {}", privateKey, e);
            throw new RuntimeException("Failed to load private key", e);
        }
    }

     // Load and parse public key from file
    private RSAPublicKey loadPublicKeyFromFile() {
        try {
            log.debug("Loading public key from: {}", publicKey);
            String publicKeyContent = loadKeyContent(publicKey);

            // Clean the key content
            String cleanedKey = cleanKeyContent(publicKeyContent, "PUBLIC KEY");

            // Parse the key
            byte[] keyBytes = Base64.getDecoder().decode(cleanedKey);
            X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");

            RSAPublicKey key = (RSAPublicKey) keyFactory.generatePublic(spec);
            log.info("Successfully loaded public key");
            return key;

        } catch (Exception e) {
            log.error("Failed to load public key from: {}", publicKey, e);
            throw new RuntimeException("Failed to load public key", e);
        }
    }

     // Clean key content by removing headers, footers, and whitespace
    private String cleanKeyContent(String keyContent, String keyType) {
        return keyContent
                .replace("-----BEGIN " + keyType + "-----", "")
                .replace("-----END " + keyType + "-----", "")
                .replace("-----BEGIN RSA " + keyType + "-----", "")
                .replace("-----END RSA " + keyType + "-----", "")
                .replaceAll("\\s", "")
                .trim();
    }

     // Load key content from file or classpath resource
    private String loadKeyContent(String keyPath) throws IOException {
        if (keyPath == null || keyPath.trim().isEmpty()) {
            throw new IllegalArgumentException("Key path cannot be null or empty");
        }

        log.debug("Attempting to load key from path: {}", keyPath);

        // Handle different resource prefixes
        if (keyPath.startsWith("file:")) {
            // Handle file: prefix - load from filesystem
            String filePath = keyPath.substring("file:".length());
            return loadFromFileSystem(filePath);
        } else if (keyPath.startsWith("classpath:")) {
            // Handle classpath: prefix - load from classpath
            return loadFromClasspath(keyPath);
        } else {
            // No prefix - try different strategies
            return loadWithMultipleStrategies(keyPath);
        }
    }

    /**
     * Try multiple loading strategies when no explicit prefix is provided
     */
    private String loadWithMultipleStrategies(String keyPath) throws IOException {
        String content;
        Exception lastException;

        // Strategy 1: Classpath resource
        try {
            content = loadFromClasspath(keyPath);
            log.debug("Successfully loaded key from classpath: {}", keyPath);
            return content;
        } catch (Exception e) {
            log.debug("Failed to load from classpath: {}, trying next strategy", keyPath);
            lastException = e;
        }

        // Strategy 2: File system path (absolute or relative)
        try {
            content = loadFromFileSystem(keyPath);
            log.debug("Successfully loaded key from filesystem: {}", keyPath);
            return content;
        } catch (Exception e) {
            log.debug("Failed to load from filesystem: {}", keyPath);
            lastException = e;
        }

        // Strategy 3: Relative to resources directory
        try {
            String resourcePath = "src/main/resources/" + keyPath;
            content = loadFromFileSystem(resourcePath);
            log.debug("Successfully loaded key from resources directory: {}", resourcePath);
            return content;
        } catch (Exception e) {
            log.debug("Failed to load from resources directory: {}", keyPath);
            lastException = e;
        }

        // If all strategies failed
        throw new FileNotFoundException("Could not load key file: " + keyPath +
                ". Last error: " + lastException.getMessage());
    }


    // Load content from classpath resource

    private String loadFromClasspath(String resourcePath) throws IOException {
        String path = resourcePath.startsWith("classpath:") ?
                resourcePath.substring("classpath:".length()) : resourcePath;

        // Remove leading slash if present
        if (path.startsWith("/")) {
            path = path.substring(1);
        }

        ClassPathResource resource = new ClassPathResource(path);
        if (!resource.exists()) {
            throw new FileNotFoundException("Classpath resource not found: " + path);
        }

        try (InputStream inputStream = resource.getInputStream()) {
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

     // Load content from file system
    private String loadFromFileSystem(String filePath) throws IOException {
        Path path = Paths.get(filePath);
        if (!Files.exists(path)) {
            throw new FileNotFoundException("File not found: " + filePath);
        }
        return Files.readString(path, StandardCharsets.UTF_8);
    }


     // Reset cached keys (useful for testing or key rotation)
    public void resetCache() {
        this.cachedPrivateKey = null;
        this.cachedPublicKey = null;
        log.debug("RSA key cache reset");
    }


    // Check if keys are properly configured
    public boolean isConfigured() {
        return privateKey != null && !privateKey.trim().isEmpty() &&
                publicKey != null && !publicKey.trim().isEmpty();
    }

    // Validate that keys can be loaded successfully
    public void validateKeys() {
        try {
            getPrivateKey();
            getPublicKey();
            log.info("RSA key validation successful");
        } catch (Exception e) {
            log.error("RSA key validation failed", e);
            throw new RuntimeException("RSA key validation failed", e);
        }
    }
}