package com.infernokun.infernoComics.utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infernokun.infernoComics.models.Series;

import java.text.Normalizer;
import java.util.regex.Pattern;

public class InfernoComicsUtils {

    public static final ObjectMapper objectMapper = new ObjectMapper();

    private static final Pattern INVALID_CHARS = Pattern.compile("[^a-zA-Z0-9\\s\\-_]");
    private static final Pattern MULTIPLE_SPACES = Pattern.compile("\\s+");

    public static Series.FolderMapping createFolderMapping(long id, String comicVineId, String name) {
        Series.FolderMapping folderMapping = new Series.FolderMapping(id, normalize(comicVineId + "_" + name));
        return folderMapping;
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
}