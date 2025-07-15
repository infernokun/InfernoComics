package com.infernokun.infernoComics.services.gcd;

import com.infernokun.infernoComics.models.gcd.GCDCover;
import com.infernokun.infernoComics.models.gcd.GCDIssue;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@ConditionalOnProperty(name = "selenium.enabled", havingValue = "true")
public class GCDCoverPageScraper {

    private static final String GCD_COVER_URL = "https://www.comics.org/issue/%d/cover/4/";
    private static final int DRIVER_POOL_SIZE = 3; // Multiple drivers for parallel processing

    private List<WebDriver> driverPool;
    private int currentDriverIndex = 0;

    //@PostConstruct
    public void initializeDriverPool() {
        log.info("🚀 Initializing Selenium driver pool with {} drivers", DRIVER_POOL_SIZE);

        driverPool = new ArrayList<>();

        for (int i = 0; i < DRIVER_POOL_SIZE; i++) {
            try {
                WebDriver driver = createOptimizedDriver();
                driverPool.add(driver);
                log.info("🤖 Created driver {}/{}", i + 1, DRIVER_POOL_SIZE);
            } catch (Exception e) {
                log.error("❌ Failed to create driver {}: {}", i + 1, e.getMessage());
            }
        }

        log.info("✅ Driver pool initialized with {} drivers", driverPool.size());
    }

    @PreDestroy
    public void destroyDriverPool() {
        log.info("🛑 Shutting down Selenium driver pool");

        if (driverPool != null) {
            for (WebDriver driver : driverPool) {
                try {
                    driver.quit();
                } catch (Exception e) {
                    log.warn("⚠️ Error closing driver: {}", e.getMessage());
                }
            }
        }

        log.info("✅ Driver pool shutdown complete");
    }

    private WebDriver createOptimizedDriver() {
        try {
            ChromeOptions options = new ChromeOptions();

            // Ultra-fast options
            options.addArguments("--headless");
            options.addArguments("--no-sandbox");
            options.addArguments("--disable-dev-shm-usage");
            options.addArguments("--disable-gpu");
            options.addArguments("--disable-software-rasterizer");
            options.addArguments("--disable-background-timer-throttling");
            options.addArguments("--disable-backgrounding-occluded-windows");
            options.addArguments("--disable-renderer-backgrounding");
            options.addArguments("--disable-features=TranslateUI");
            options.addArguments("--disable-ipc-flooding-protection");

            // Speed optimizations
            options.addArguments("--no-first-run");
            options.addArguments("--no-default-browser-check");
            options.addArguments("--disable-default-apps");
            options.addArguments("--disable-extensions");
            options.addArguments("--disable-plugins");
            options.addArguments("--disable-sync");
            options.addArguments("--disable-translate");
            options.addArguments("--hide-scrollbars");
            options.addArguments("--metrics-recording-only");
            options.addArguments("--mute-audio");
            options.addArguments("--safebrowsing-disable-auto-update");
            options.addArguments("--disable-logging");
            options.addArguments("--disable-permissions-api");
            options.addArguments("--disable-web-security");

            // Block unnecessary resources
            /*Map<String, Object> prefs = new HashMap<>();
            prefs.put("profile.managed_default_content_settings.images", 2); // Block images
            prefs.put("profile.managed_default_content_settings.stylesheets", 2); // Block CSS
            prefs.put("profile.managed_default_content_settings.cookies", 2); // Block cookies
            prefs.put("profile.managed_default_content_settings.javascript", 2); // Block JS
            prefs.put("profile.managed_default_content_settings.plugins", 2); // Block plugins
            prefs.put("profile.managed_default_content_settings.popups", 2); // Block popups
            prefs.put("profile.managed_default_content_settings.geolocation", 2); // Block location
            prefs.put("profile.managed_default_content_settings.media_stream", 2); // Block media
            options.setExperimentalOption("prefs", prefs);*/

            String[] userAgents = {
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            };
            options.addArguments("--user-agent=" + userAgents[new Random().nextInt(userAgents.length)]);

            // Remove automation indicators
            options.setExperimentalOption("excludeSwitches", List.of("enable-automation"));
            options.setExperimentalOption("useAutomationExtension", false);

            WebDriver driver = new ChromeDriver(options);

            // Ultra-fast timeouts
            driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(10));
            driver.manage().timeouts().implicitlyWait(Duration.ofMillis(500));

            return driver;

        } catch (Exception e) {
            log.error("❌ Failed to create optimized WebDriver: {}", e.getMessage());
            throw new RuntimeException("Could not create optimized WebDriver", e);
        }
    }

    /**
     * Get next available driver from pool (round-robin)
     */
    private synchronized WebDriver getNextDriver() {
        if (driverPool.isEmpty()) {
            throw new RuntimeException("No drivers available in pool");
        }

        WebDriver driver = driverPool.get(currentDriverIndex);
        currentDriverIndex = (currentDriverIndex + 1) % driverPool.size();
        return driver;
    }

    /**
     * Main scraping method - always collects ALL covers found on the page
     */
    public GCDCover scrapeCoverPage(GCDIssue issue) {
        GCDCover gcdCover = new GCDCover();
        WebDriver driver;

        try {
            driver = getNextDriver();

            String coverPageUrl = String.format(GCD_COVER_URL, issue.getId());

            log.info("⚡ Scraping all covers: {}", coverPageUrl);

            // Navigate to the cover page
            driver.get(coverPageUrl);

            // Wait for page to load properly - increase wait time
            Thread.sleep(2000);

            driver.get(coverPageUrl);

            gcdCover = findAllCoverImages(driver);
            //gcdCover.setCoverPageUrl(coverPageUrl);

            // Check if page loaded correctly
            String currentUrl = driver.getCurrentUrl();
            String pageTitle = driver.getTitle();
            log.info("⚡ Page loaded - URL: {}, Title: {}", currentUrl, pageTitle);

            // Check for error pages or redirects
            if (Objects.requireNonNull(currentUrl).contains("error") || Objects.requireNonNull(pageTitle).toLowerCase().contains("error") ||
                    pageTitle.toLowerCase().contains("not found")) {
                gcdCover.setError("Page not found or error page detected");
                log.warn("⚡ ❌ Error page detected for issue {}", issue.getId());
                return gcdCover;
            }

            if (!gcdCover.getUrls().isEmpty()) {
                //gcdCover.setFound(true);
                log.info("⚡ ✅ Found {} covers: {}", gcdCover.getUrls().size(), gcdCover.getUrls());
                return gcdCover;
            }
            // If no covers found, let's debug what's on the page
            logPageDebugInfo(driver);

            gcdCover.setError("No cover images found on page");
            log.info("⚡ ❌ No covers found for issue {}", issue.getId());
            return gcdCover;

        } catch (Exception e) {
            log.error("⚡  Error scraping issue {}: {}", issue.getId(), e.getMessage(), e);
            gcdCover.setError("Error: " + e.getMessage());
            return gcdCover;
        }
    }

    /**
     * Find ALL cover images on the page - collects every matching image
     */
    private GCDCover findAllCoverImages(WebDriver driver) {
        GCDCover gcdCover = new GCDCover();

        gcdCover.setUrls(new ArrayList<>());

        // Search through all selectors to find every possible cover
        String[] selectors = {
                "img[src*='/covers_by_id/']",    // Most specific - targets actual cover images
                "img.cover_img",                 // Main GCD cover class
                "img[src*='covers']",            // Any image with 'covers' in URL
                ".cover img",                    // Images inside cover containers
                "img[alt*='cover']"              // Images with 'cover' in alt text
        };

        try {
            Pattern pattern = Pattern.compile(".*:: (.+)$");
            Matcher matcher = pattern.matcher(Objects.requireNonNull(driver.getTitle()));
            //gcdCover.setIssueName(matcher.find() ? matcher.group(1) : driver.getTitle());
            //log.info("⚡ Extracted comic name: {}", gcdCover.getIssueName());
        } catch (Exception e) {
            log.warn("⚡ Failed to extract comic name: {}", e.getMessage());
            //gcdCover.setIssueName("Unknown");
        }

        Set<String> foundUrls = new HashSet<>(); // Use Set to prevent duplicates

        for (String selector : selectors) {
            try {
                List<WebElement> images = driver.findElements(By.cssSelector(selector));
                log.debug("⚡ Selector '{}' found {} elements", selector, images.size());

                for (WebElement img : images) {
                    try {
                        String src = img.getAttribute("src");
                        if (src != null && !src.trim().isEmpty()) {

                        // More comprehensive URL validation
                            String fullUrl = normalizeUrl(src);

                            // Add to set first to check for duplicates
                            if (foundUrls.add(fullUrl)) {
                                gcdCover.getUrls().add(fullUrl);
                                log.info("⚡ Added cover #{} from '{}': {}",
                                        gcdCover.getUrls().size(), selector, fullUrl);
                            }
                        }
                    } catch (Exception e) {
                        log.debug("⚡ Error processing image element: {}", e.getMessage());
                    }
                }

            } catch (Exception e) {
                log.debug("⚡ Selector '{}' failed: {}", selector, e.getMessage());
            }
        }

        log.info("⚡ Total covers collected: {}", gcdCover.getUrls().size());
        return gcdCover;
    }

    /**
     * Normalize URL (handle relative URLs)
     */
    private String normalizeUrl(String url) {
        if (url.startsWith("//")) {
            return "https:" + url;
        } else if (url.startsWith("/")) {
            return "https://www.comics.org" + url;
        } else if (!url.startsWith("http")) {
            return "https://www.comics.org/" + url;
        }
        return url;
    }

    private void logPageDebugInfo(WebDriver driver) {
        try {
            log.info("⚡ DEBUG: Page source length: {}", Objects.requireNonNull(driver.getPageSource()).length());

            // Check for common error indicators
            String pageSource = driver.getPageSource().toLowerCase();
            if (pageSource.contains("error") || pageSource.contains("not found") ||
                    pageSource.contains("404") || pageSource.contains("403")) {
                log.warn("⚡ DEBUG: Page appears to contain error content");

                log.error(pageSource);
            }

            // Log all images found on page for debugging
            List<WebElement> allImages = driver.findElements(By.tagName("img"));
            log.info("⚡ DEBUG: Total images on page: {}", allImages.size());

            // Log first few image sources for debugging
            for (int i = 0; i < Math.min(5, allImages.size()); i++) {
                try {
                    String src = allImages.get(i).getAttribute("src");
                    log.info("⚡ DEBUG: Image {}: {}", i + 1, src);
                } catch (Exception e) {
                    log.debug("⚡ DEBUG: Error getting image src: {}", e.getMessage());
                }
            }

            // Check if there are any links to covers
            List<WebElement> coverLinks = driver.findElements(By.cssSelector("a[href*='cover']"));
            log.info("⚡ DEBUG: Cover-related links found: {}", coverLinks.size());

        } catch (Exception e) {
            log.debug("⚡ DEBUG: Error during page debug: {}", e.getMessage());
        }
    }

    @Setter
    @Getter
    public static class CoverResult {
        private Long issueId;
        private String issueNumber;
        private List<String> allCoverUrls; // All covers (including variants)
        private String coverPageUrl;
        private boolean found;
        private String error;

        public CoverResult(Long issueId, String issueNumber) {
            this.issueId = issueId;
            this.issueNumber = issueNumber;
            this.found = false;
            this.allCoverUrls = new ArrayList<>();
        }

        /**
         * Get total number of covers found
         */
        public int getCoverCount() {
            return allCoverUrls.size();
        }

        /**
         * Check if multiple covers were found (variants)
         */
        public boolean hasVariants() {
            return allCoverUrls != null && allCoverUrls.size() > 1;
        }

        @Override
        public String toString() {
            return "CoverResult{" +
                    "issueId=" + issueId +
                    ", found=" + found +
                    ", coverCount=" + getCoverCount() +
                    ", allCoverUrls='" + allCoverUrls.toString() + '\'' +
                    '}';
        }
    }
}