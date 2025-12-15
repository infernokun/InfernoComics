package com.infernokun.infernoComics.utils;

public class GenericTextCleaner {

    public static String makeReadable(String rawText) {
        if (rawText == null) return "";

        String cleaned = rawText
                // Remove HTML tags
                .replaceAll("<[^>]*>", "")

                // Decode common HTML entities
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&nbsp;", " ")
                .replace("&mdash;", "—")
                .replace("&ndash;", "–")

                // Fix spacing issues
                .replaceAll("\\s+", " ")  // Multiple spaces to single
                .trim();

        // Add paragraph breaks for better readability
        cleaned = addSmartParagraphBreaks(cleaned);

        return cleaned;
    }

    private static String addSmartParagraphBreaks(String text) {
        return text
                // Break after sentences followed by capital letters (new thoughts)
                .replaceAll("([.!?])\\s*([A-Z])", "$1\n\n$2")

                // Break before location/setting patterns (Place:)
                .replaceAll("([.!?])\\s*([A-Z][^:]*:)", "$1\n\n$2")

                // Break before quoted dialogue
                .replaceAll("([.!?])\\s*(\"[^\"]*\")", "$1\n\n$2")

                // Break after quoted dialogue
                .replaceAll("(\"[^\"]*\")\\s*([A-Z])", "$1\n\n$2")

                // Clean up excessive line breaks
                .replaceAll("\\n{3,}", "\n\n");
    }

    // More conservative approach - only break on clear paragraph indicators
    public static String addBasicParagraphs(String text) {
        return text
                // Break on clear sentence endings followed by new topics
                .replaceAll("([.!?])\\s*([A-Z][a-z]+[,:])", "$1\n\n$2")

                // Break on obvious dialogue
                .replaceAll("([.!?])\\s*(\")", "$1\n\n$2")

                // Clean up
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }

    // Just clean HTML and entities - minimal formatting
    public static String cleanOnly(String rawText) {
        if (rawText == null) return "";

        return rawText
                .replaceAll("<[^>]*>", "")
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&nbsp;", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }
}
