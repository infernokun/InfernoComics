package com.infernokun.infernoComics.services.gcd;

import com.infernokun.infernoComics.models.gcd.GCDIssue;
import com.infernokun.infernoComics.models.gcd.GCDSeries;
import com.infernokun.infernoComics.repositories.gcd.GCDIssueRepository;
import com.infernokun.infernoComics.repositories.gcd.GCDSeriesRepository;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.*;

@Slf4j
@Service
public class GCDatabaseService {
    private final WebClient webClient;

    private static final String GCD_BASE_URL = "https://www.comics.org";
    private static final String GCD_SEARCH_PATH = "/search/advanced/process/";
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);

    private final GCDSeriesRepository gcdSeriesRepository;
    private final GCDIssueRepository gcdIssueRepository;

    public GCDatabaseService(GCDSeriesRepository gcdSeriesRepository, GCDIssueRepository gcdIssueRepository) {
        this.gcdSeriesRepository = gcdSeriesRepository;
        this.gcdIssueRepository = gcdIssueRepository;
        this.webClient = WebClient.builder()
                .baseUrl(GCD_BASE_URL)
                .defaultHeaders(headers -> {
                    headers.add(HttpHeaders.USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
                    headers.add(HttpHeaders.ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8");
                    headers.add(HttpHeaders.ACCEPT_LANGUAGE, "en-US,en;q=0.5");
                    headers.add(HttpHeaders.ACCEPT_ENCODING, "gzip, deflate");
                    headers.add(HttpHeaders.CONNECTION, "keep-alive");
                    headers.add("Upgrade-Insecure-Requests", "1");
                })
                .codecs(config -> config.defaultCodecs().maxInMemorySize(1024 * 1024))
                .build();
    }

    public List<GCDSeries> findGCDSeries() {
        return gcdSeriesRepository.findAll();
    }

    public List<GCDIssue> findGCDIssues() {
        return gcdIssueRepository.findAll();
    }

    public List<GCDSeries> findGCDSeriesByName(String name) {
        return gcdSeriesRepository.findByNameContainingIgnoreCase(name);
    }

    public List<GCDSeries> findGCDSeriesByYearBeganAndNameContainingIgnoreCase(int year, String name) {
        return gcdSeriesRepository.findByYearBeganAndNameContainingIgnoreCase(year, name);
    }

    public List<GCDIssue> findGCDIssueBySeriesIds(List<Long> seriesIds) {
        return gcdIssueRepository.findBySeriesIdIn(seriesIds);
    }

    public List<String> getVariantCovers(String seriesName, String publisher, String startYear, String issueNumber) {
        publisher = publisher.split(" ")[0];
        seriesName = seriesName.replace(" ", "%20");
        try {
            log.info("Fetching variants for series: {}, publisher: {}, year: {}, issue: {}",
                    seriesName, publisher, startYear, issueNumber);

            String searchUrl = buildSearchUri(seriesName, publisher, startYear);
            String htmlContent = fetchHtmlContent(searchUrl);

            log.error("html content: {}", htmlContent);

            if (htmlContent != null && !htmlContent.isEmpty()) {
                List<String> variants = parseVariantUrls(htmlContent, issueNumber);
                if (!variants.isEmpty()) {
                    return variants;
                }
            }


            return Collections.emptyList();

        } catch (Exception e) {
            log.error("Error fetching variants for series: {} - {}", seriesName, e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    /**
     * Builds the search URL for the Grand Comics Database
     */
    private String buildSearchUri(String seriesName, String publisher, String startYear) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromPath(GCD_SEARCH_PATH)
                .queryParam("target", "series")
                .queryParam("method", "istartswith")
                .queryParam("series", seriesName)
                .queryParam("order1", "series")
                .queryParam("country", "us")
                .queryParam("series_year_began", startYear)
                .queryParam("pub_name", publisher);
        return builder.build().toUriString();
    }

    /**
     * Fetches HTML content from the given URL
     */
    private String fetchHtmlContent(String uri) {
        try {
            return webClient.get()
                    .uri(uri)
                    .retrieve()
                    .onStatus(status -> status.is4xxClientError() || status.is5xxServerError(),
                            response -> {
                                log.warn("HTTP error {} when fetching: {}", response.statusCode(), GCD_BASE_URL + uri);
                                return Mono.error(new RuntimeException("HTTP error: " + response.statusCode()));
                            })
                    .bodyToMono(String.class)
                    .timeout(REQUEST_TIMEOUT)
                    .block();
        } catch (Exception e) {
            log.error("Failed to fetch HTML content from URL: {} - {}", uri, e.getMessage());
            return null;
        }
    }

    /**
     * Parses the HTML content to extract variant cover URLs for a specific issue
     */
    private List<String> parseVariantUrls(String htmlContent, String issueNumber) {
        try {
            Document doc = Jsoup.parse(htmlContent);
            List<String> variantUrls = new ArrayList<>();

            // Look for series results first
            Elements seriesLinks = doc.select("a[href*='/series/']");

            if (seriesLinks.isEmpty()) {
                log.warn("No series links found in search results");
                return Collections.emptyList();
            }

            // Get the first series link (most relevant match)
            String seriesUrl = Objects.requireNonNull(seriesLinks.first()).attr("href");
            if (!seriesUrl.startsWith("http")) {
                seriesUrl = GCD_BASE_URL + seriesUrl;
            }

            log.debug("Found series URL: {}", seriesUrl);

            // Fetch the series page to get issue details
            String seriesHtml = fetchHtmlContent(seriesUrl);
            if (seriesHtml != null) {
                variantUrls.addAll(parseIssueVariants(seriesHtml, issueNumber));
            }

            return variantUrls;

        } catch (Exception e) {
            log.error("Error parsing variant URLs from HTML content: {}", e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    /**
     * Parses issue variants from the series page
     */
    private List<String> parseIssueVariants(String seriesHtml, String issueNumber) {
        try {
            Document doc = Jsoup.parse(seriesHtml);
            List<String> variantUrls = new ArrayList<>();

            // Look for issue table rows
            Elements issueRows = doc.select("table.listing tr");

            for (Element row : issueRows) {
                Elements cells = row.select("td");
                if (cells.size() >= 2) {
                    String rowIssueNumber = cells.getFirst().text().trim();

                    // Check if this row matches our target issue number
                    if (matchesIssueNumber(rowIssueNumber, issueNumber)) {
                        // Look for cover images in this row
                        Elements coverLinks = row.select("a[href*='/covers/']");

                        for (Element coverLink : coverLinks) {
                            String coverUrl = coverLink.attr("href");
                            if (!coverUrl.startsWith("http")) {
                                coverUrl = GCD_BASE_URL + coverUrl;
                            }

                            // Fetch the cover page to get the actual image URL
                            String imageUrl = extractImageUrlFromCoverPage(coverUrl);
                            if (imageUrl != null && !imageUrl.isEmpty()) {
                                variantUrls.add(imageUrl);
                            }
                        }
                    }
                }
            }

            log.info("Found {} variant covers for issue {}", variantUrls.size(), issueNumber);
            return variantUrls;

        } catch (Exception e) {
            log.error("Error parsing issue variants: {}", e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    /**
     * Extracts the actual image URL from a cover page
     */
    private String extractImageUrlFromCoverPage(String coverPageUrl) {
        try {
            String coverHtml = fetchHtmlContent(coverPageUrl);
            if (coverHtml == null) {
                return null;
            }

            Document doc = Jsoup.parse(coverHtml);

            // Look for the main cover image
            Elements imgElements = doc.select("img[src*='/covers/']");
            if (!imgElements.isEmpty()) {
                String imageUrl = Objects.requireNonNull(imgElements.first()).attr("src");
                if (!imageUrl.startsWith("http")) {
                    imageUrl = GCD_BASE_URL + imageUrl;
                }
                return imageUrl;
            }

            return null;

        } catch (Exception e) {
            log.error("Error extracting image URL from cover page: {} - {}", coverPageUrl, e.getMessage());
            return null;
        }
    }

    /**
     * Checks if the row issue number matches the target issue number
     * Handles various formats like "1", "#1", "1a", "1b", etc.
     */
    private boolean matchesIssueNumber(String rowIssueNumber, String targetIssueNumber) {
        if (rowIssueNumber == null || targetIssueNumber == null) {
            return false;
        }

        // Clean up the issue numbers for comparison
        String cleanRowNumber = rowIssueNumber.replaceAll("[^0-9a-zA-Z]", "").toLowerCase();
        String cleanTargetNumber = targetIssueNumber.replaceAll("[^0-9a-zA-Z]", "").toLowerCase();

        return cleanRowNumber.equals(cleanTargetNumber) ||
                cleanRowNumber.startsWith(cleanTargetNumber) ||
                cleanTargetNumber.startsWith(cleanRowNumber);
    }

    /**
     * Batch method to get variants for multiple issues
     */
    public Map<String, List<String>> getVariantCoversForMultipleIssues(
            String seriesName, String publisher, String startYear, List<String> issueNumbers) {

        Map<String, List<String>> variantMap = new HashMap<>();

        for (String issueNumber : issueNumbers) {
            List<String> variants = getVariantCovers(seriesName, publisher, startYear, issueNumber);
            variantMap.put(issueNumber, variants);

            // Add a small delay between requests to be respectful to the server
            try {
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.warn("Thread interrupted while waiting between requests");
                break;
            }
        }

        return variantMap;
    }

    /**
     * Utility method to validate if a URL is a valid image URL
     */
    private boolean isValidImageUrl(String url) {
        return url != null &&
                !url.isEmpty() &&
                (url.toLowerCase().endsWith(".jpg") ||
                        url.toLowerCase().endsWith(".jpeg") ||
                        url.toLowerCase().endsWith(".png") ||
                        url.toLowerCase().endsWith(".gif") ||
                        url.toLowerCase().endsWith(".webp"));
    }
}