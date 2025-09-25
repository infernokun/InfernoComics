package com.infernokun.infernoComics.utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.sync.ProcessedFile;
import io.micrometer.common.lang.Nullable;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.regex.Pattern;

public class InfernoComicsUtils {

    public static final ObjectMapper objectMapper = new ObjectMapper();

    private static final Pattern INVALID_CHARS = Pattern.compile("[^a-zA-Z0-9\\s\\-_]");
    private static final Pattern MULTIPLE_SPACES = Pattern.compile("\\s+");

    private static final Base64.Encoder BASE64_ENCODER = Base64.getUrlEncoder().withoutPadding();

    public static Series.FolderMapping createFolderMapping(long id, String comicVineId, String name) {
        return new Series.FolderMapping(id, normalize(comicVineId + "_" + name));
    }

    public static String normalize(String name) {
        if (name == null || name.trim().isEmpty()) {
            return "unknown";
        }

        String normalized = name.trim();

        normalized = Normalizer.normalize(normalized, Normalizer.Form.NFD);
        normalized = normalized.replaceAll("\\p{M}", ""); // Remove diacritics
        normalized = INVALID_CHARS.matcher(normalized).replaceAll("");
        normalized = MULTIPLE_SPACES.matcher(normalized).replaceAll(" ");
        normalized = normalized.replace(" ", "_");
        normalized = normalized.toLowerCase();
        normalized = normalized.replaceAll("^[_\\-]+|[_\\-]+$", "");

        if (normalized.isEmpty()) {
            return "unknown";
        }

        if (normalized.length() > 100) {
            normalized = normalized.substring(0, 100);
            normalized = normalized.replaceAll("_+$", "");
        }

        return normalized;
    }

    public static String createEtag(MultipartFile file) {
        if (file == null) {
            throw new IllegalArgumentException("file must not be null");
        }

        try (InputStream in = file.getInputStream()) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                md.update(buffer, 0, read);
            }
            byte[] digest = md.digest();
            String base64 = BASE64_ENCODER.encodeToString(digest);
            return "\"" + base64 + "\"";
        } catch (IOException | NoSuchAlgorithmException e) {
            throw new RuntimeException("Failed to compute ETag", e);
        }
    }

    public static String createEtag(byte[] content) {
        if (content == null) {
            throw new IllegalArgumentException("content must not be null");
        }
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(content);
            return BASE64_ENCODER.encodeToString(md.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}