package com.infernokun.infernoComics.services.gcd;

import com.infernokun.infernoComics.models.gcd.GCDIssue;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.time.Duration;
import java.util.*;

@Slf4j
@Service
@ConditionalOnProperty(name = "selenium.enabled", havingValue = "true")
public class GCDCoverPageScraper {

    private static final String GCD_COVER_URL = "https://www.comics.org/issue/%d/cover/4/";
    private static final int DRIVER_POOL_SIZE = 3; // Multiple drivers for parallel processing

    private List<WebDriver> driverPool;
    private int currentDriverIndex = 0;

    @PostConstruct
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
            Map<String, Object> prefs = new HashMap<>();
            prefs.put("profile.managed_default_content_settings.images", 2); // Block images
            prefs.put("profile.managed_default_content_settings.stylesheets", 2); // Block CSS
            prefs.put("profile.managed_default_content_settings.cookies", 2); // Block cookies
            prefs.put("profile.managed_default_content_settings.javascript", 2); // Block JS
            prefs.put("profile.managed_default_content_settings.plugins", 2); // Block plugins
            prefs.put("profile.managed_default_content_settings.popups", 2); // Block popups
            prefs.put("profile.managed_default_content_settings.geolocation", 2); // Block location
            prefs.put("profile.managed_default_content_settings.media_stream", 2); // Block media
            options.setExperimentalOption("prefs", prefs);

            // Minimal user agent
            options.addArguments("--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36");

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
    public CoverResult scrapeCoverPage(GCDIssue issue) {
        CoverResult result = new CoverResult(issue.getId(), issue.getNumber());
        WebDriver driver = null;

        try {
            driver = getNextDriver();

            String coverPageUrl = String.format(GCD_COVER_URL, issue.getId());
            result.setCoverPageUrl(coverPageUrl);

            log.info("⚡ Scraping all covers: {}", coverPageUrl);

            // Navigate to the cover page
            driver.get(coverPageUrl);

            // Minimal wait - page should load fast with our optimizations
            Thread.sleep(300);

            // Get ALL cover images from the page
            List<String> allCoverUrls = findAllCoverImages(driver);

            if (!allCoverUrls.isEmpty()) {
                result.setAllCoverUrls(allCoverUrls); // All covers
                result.setFound(true);
                log.info("⚡ ✅ Found {} covers: {}", allCoverUrls.size(), allCoverUrls);
                return result;
            }

            result.setError("No cover images found on page");
            log.info("⚡ ❌ No covers found for issue {}", issue.getId());
            return result;

        } catch (Exception e) {
            log.error("⚡ 💥 Error scraping issue {}: {}", issue.getId(), e.getMessage());
            result.setError("Error: " + e.getMessage());
            return result;
        }
    }

    /**
     * Find ALL cover images on the page - collects every matching image
     */
    private List<String> findAllCoverImages(WebDriver driver) {
        List<String> allCoverUrls = new ArrayList<>();

        // Search through all selectors to find every possible cover
        String[] selectors = {
                "img[src*='/covers_by_id/']",    // Most specific - targets actual cover images
                "img.cover_img",                 // Main GCD cover class
                "img[src*='covers']",            // Any image with 'covers' in URL
                ".cover img",                    // Images inside cover containers
                "img[alt*='cover']"              // Images with 'cover' in alt text
        };

        for (String selector : selectors) {
            try {
                List<WebElement> images = driver.findElements(By.cssSelector(selector));

                for (WebElement img : images) {
                    String src = img.getAttribute("src");
                    if (src != null && !src.trim().isEmpty()) {
                        // Validate this looks like a cover URL
                        if (src.contains("files1.comics.org") || src.contains("covers")) {
                            String fullUrl = normalizeUrl(src);

                            // Add to list if not already present (avoid duplicates)
                            if (!allCoverUrls.contains(fullUrl)) {
                                allCoverUrls.add(fullUrl);
                                log.info("⚡ Added cover #{} from '{}': {}",
                                        allCoverUrls.size(), selector, fullUrl);
                            }
                        }
                    }
                }

            } catch (Exception e) {
                log.debug("⚡ Selector '{}' failed: {}", selector, e.getMessage());
                // Continue to next selector
            }
        }

        log.info("⚡ Total covers collected: {}", allCoverUrls.size());
        return allCoverUrls;
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