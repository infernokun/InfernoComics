package com.infernokun.infernoComics.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infernokun.infernoComics.clients.InfernoComicsWebClient;
import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.controllers.SeriesController;
import com.infernokun.infernoComics.models.DescriptionGenerated;
import com.infernokun.infernoComics.models.Issue;
import com.infernokun.infernoComics.models.MissingIssue;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.dto.IssueRequest;
import com.infernokun.infernoComics.models.gcd.GCDIssue;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.repositories.MissingIssueRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.services.gcd.GCDatabaseService;
import com.infernokun.infernoComics.utils.CacheConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.CacheManager;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;

import java.io.IOException;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static com.infernokun.infernoComics.utils.InfernoComicsUtils.createEtag;

@Slf4j
@Service
@Transactional
@RequiredArgsConstructor
public class IssueService {
    private final InfernoComicsConfig infernoComicsConfig;

    private final IssueRepository issueRepository;
    private final SeriesRepository seriesRepository;
    private final MissingIssueRepository missingIssueRepository;

    private final ComicVineService comicVineService;
    private final GCDatabaseService gcDatabaseService;
    private final RecognitionService recognitionService;
    private final DescriptionGeneratorService descriptionGeneratorService;

    private final CacheManager cacheManager;
    private final InfernoComicsWebClient webClient;

    public List<Issue> getAllIssues() {
        List<Issue> cachedIssues = getCachedValue();

        if (cachedIssues != null) {
            log.info("Returning cached issues list with {} items", cachedIssues.size());
            return cachedIssues;
        }

        List<Issue> issues = issueRepository.findAll();
        putCacheValue(issues);
        return issues;
    }

    @Cacheable(value = "issue", key = "#id", unless = "#result == null")
    public Issue getIssueById(Long id) {
        log.info("Fetching issue with ID: {}", id);
        return issueRepository.findById(id).orElse(null);
    }

    @Cacheable(value = "issues-by-series", key = "#seriesId", unless = "#result.isEmpty()")
    public List<Issue> getIssuesBySeriesId(Long seriesId) {
        log.info("Fetching issues for series ID: {}", seriesId);

        try {
            List<Issue> issues = issueRepository.findBySeriesIdOrderByIssueNumberAsc(seriesId);
            issues.sort(this::compareIssueNumbers);
            return issues;
        } catch (Exception e) {
            log.error("Error fetching issues for series ID {}: {}", seriesId, e.getMessage(), e);
            return new ArrayList<>();
        }
    }

    @Cacheable(value = "key-issues", key = "'all'", unless = "#result.isEmpty()")
    public List<Issue> getKeyIssues() {
        log.info("Fetching key issues");
        return issueRepository.findKeyIssues();
    }

    @Cacheable(value = "variant-issues", key = "'all'", unless = "#result.isEmpty()")
    public List<Issue> getVariantIssues() {
        log.info("Fetching issues with variant covers");
        return issueRepository.findAll().stream()
                .filter(Issue::getIsVariant)
                .collect(Collectors.toList());
    }

    @Cacheable(value = "recent-issues", key = "#limit")
    public List<Issue> getRecentIssues(int limit) {
        log.info("Fetching {} recent issues", limit);
        return issueRepository.findAll().stream()
                .sorted((c1, c2) -> c2.getCreatedAt().compareTo(c1.getCreatedAt()))
                .limit(limit)
                .collect(Collectors.toList());
    }

    @Cacheable(value = "issue-search", key = "T(java.util.Objects).hash(#query, #limit)")
    public List<Issue> searchIssues(String query, int limit) {
        log.info("Searching issues with query: {} (limit: {})", query, limit);

        String lowerQuery = query.toLowerCase();
        return issueRepository.findAll().stream()
                .filter(issue ->
                        (issue.getTitle() != null && issue.getTitle().toLowerCase().contains(lowerQuery)) ||
                                issue.getSeries().getName().toLowerCase().contains(lowerQuery) ||
                                issue.getIssueNumber().toLowerCase().contains(lowerQuery)
                )
                .limit(limit)
                .collect(Collectors.toList());
    }

    @Cacheable(value = "issue-stats", key = "'global'")
    public Map<String, Object> getIssueStats() {
        log.info("Calculating issue statistics");

        List<Issue> allIssues = issueRepository.findAll();
        long totalIssues = allIssues.size();
        long keyIssues = allIssues.stream().mapToLong(issue -> issue.getIsKeyIssue() ? 1 : 0).sum();
        long variantIssues = allIssues.stream().mapToLong(issue -> issue.getIsVariant() ? 1 : 0).sum();

        Map<String, Long> conditionCounts = allIssues.stream()
                .filter(issue -> issue.getCondition() != null)
                .collect(Collectors.groupingBy(
                        issue -> issue.getCondition().toString(),
                        Collectors.counting()
                ));

        Map<String, Long> seriesCounts = allIssues.stream()
                .collect(Collectors.groupingBy(
                        issue -> issue.getSeries().getName(),
                        Collectors.counting()
                ));

        double totalValue = allIssues.stream()
                .filter(issue -> issue.getCurrentValue() != null)
                .mapToDouble(issue -> issue.getCurrentValue().doubleValue())
                .sum();

        return Map.of(
                "totalIssues", totalIssues,
                "keyIssues", keyIssues,
                "variantIssues", variantIssues,
                "conditionBreakdown", conditionCounts,
                "seriesBreakdown", seriesCounts,
                "totalCollectionValue", totalValue
        );
    }

    public ComicVineService.ComicVineIssueDto getComicVineIssueById(Long comicVineId) {
        return comicVineService.getComicVineIssueById(comicVineId);
    }

    @Cacheable(value = "comic-vine-issues-by-series", key = "#seriesId", unless = "#result.isEmpty()")
    public List<ComicVineService.ComicVineIssueDto> searchComicVineIssues(Long seriesId) {
        log.info("Searching Comic Vine issues for series ID: {}", seriesId);
        try {
            Optional<Series> series = seriesRepository.findById(seriesId);
            if (series.isPresent() && series.get().getComicVineId() != null) {
                return comicVineService.searchIssues(series.get());
            }
            return List.of();
        } catch (Exception e) {
            log.error("Error searching Comic Vine issues for series {}: {}", seriesId, e.getMessage());
            return List.of();
        }
    }

    @Transactional
    public Issue createIssue(IssueRequest request) {
        log.info("Creating issue: {} #{}", request.getSeriesId(), request.getIssueNumber());

        Optional<Series> series = seriesRepository.findById(request.getSeriesId());
        if (series.isEmpty()) {
            throw new IllegalArgumentException("Series with ID " + request.getSeriesId() + " not found");
        }

        Issue issue = createIssueWithoutCountUpdate(request, series.get());
        updateSeriesIssueCount(request.getSeriesId());
        evictIssueCaches();
        evictSeriesRelatedCaches(request.getSeriesId());

        log.info("Created issue with ID: {}", issue.getId());
        return issue;
    }

    @Transactional
    public List<Issue> createIssuesBulk(List<IssueRequest> requests) {
        if (requests.isEmpty()) {
            return new ArrayList<>();
        }

        long distinctCount = requests.stream()
                .map(IssueRequest::getSeriesId)
                .distinct()
                .count();

        if (distinctCount > 1) {
            throw new IllegalArgumentException("All issues must belong to the same series");
        }

        Long seriesId = requests.getFirst().getSeriesId();

        // Validate series exists once
        Optional<Series> series = seriesRepository.findById(seriesId);
        if (series.isEmpty()) {
            throw new IllegalArgumentException("Series with ID " + seriesId + " not found");
        }

        log.info("Creating {} issues in bulk for series {}", requests.size(), seriesId);

        // Validate all requests have same series ID
        boolean sameSeries = requests.stream()
                .allMatch(req -> Objects.equals(req.getSeriesId(), seriesId));

        if (!sameSeries) {
            throw new IllegalArgumentException("All issues must belong to the same series");
        }

        List<Issue> createdIssues = new ArrayList<>();

        // Create all issues without updating count each time
        for (IssueRequest request : requests) {
            try {
                Issue issue = createIssueWithoutCountUpdate(request, series.get());
                createdIssues.add(issue);
            } catch (Exception e) {
                log.error("Failed to create issue #{}: {}", request.getIssueNumber(), e.getMessage());
            }
        }

        // Update count once at the end
        updateSeriesIssueCount(seriesId);
        evictIssueCaches();
        evictSeriesRelatedCaches(seriesId);

        log.info("Successfully created {} out of {} issues for series {}",
                createdIssues.size(), requests.size(), seriesId);

        return createdIssues;
    }

    @CachePut(value = "issue", key = "#id", condition = "#result != null")
    @Transactional
    public Issue updateIssue(Long id, IssueRequest request) {
        log.info("Updating issue with ID: {}", id);

        Issue existingIssue = issueRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Issue with ID " + id + " not found"));

        Long seriesId = existingIssue.getSeries().getId();
        mapRequestToIssue(request, existingIssue);
        Issue updatedIssue = issueRepository.save(existingIssue);

        evictIssueCaches();
        evictSeriesRelatedCaches(seriesId);
        descriptionGeneratorService.evictIssueCache(updatedIssue);

        log.info("Updated issue: {} #{}", updatedIssue.getSeries().getName(), updatedIssue.getIssueNumber());
        return updatedIssue;
    }

    public JsonNode placeImageUpload(MultipartFile file) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            String sessionId = UUID.randomUUID().toString();
            byte[] imageBytes = file.getBytes();

            SeriesController.ImageData imageData = new SeriesController.ImageData(
                    imageBytes,
                    file.getOriginalFilename(),
                    file.getContentType(),
                    imageBytes.length,
                    null,
                    null,
                    createEtag(imageBytes)
            );

            MultipartBodyBuilder builder = new MultipartBodyBuilder();

            builder.part("session_id", sessionId);

            builder.part("image", new ByteArrayResource(imageData.bytes()) {
                @Override
                public String getFilename() {
                    return imageData.originalFilename();
                }
            }).contentType(MediaType.valueOf(imageData.contentType() != null ? imageData.contentType() : "image/jpeg"));

            log.info("Uploading image '{}' with session_id: {}",
                    imageData.originalFilename(), sessionId);

            long startTime = System.currentTimeMillis();

            String response = webClient.recognitionClient().post()
                    .uri("/add-issue")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            long duration = System.currentTimeMillis() - startTime;
            log.info("Image upload completed in {} ms", duration);

            JsonNode root = mapper.readTree(response);

            boolean success = root.path("success").asBoolean(false);
            String returnedSessionId = root.path("session_id").asText();
            JsonNode result = root.path("result");

            if (!success) {
                log.error("Image upload failed for session: {}", sessionId);
                throw new RuntimeException("Image upload failed");
            }

            log.info("Successfully processed image. Session: {}, Filename: {}",
                    returnedSessionId, result.path("filename").asText());

            return result;

        } catch (IOException e) {
            log.error("Error reading image file: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to read image file", e);
        } catch (Exception e) {
            log.error("Error uploading image: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to upload image", e);
        }
    }

    @CacheEvict(value = "issue", key = "#id")
    @Transactional
    public void deleteIssue(Long id) {
        log.info("Deleting issue with ID: {}", id);

        Issue issue = issueRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Issue with ID " + id + " not found"));

        Long seriesId = issue.getSeries().getId();
        descriptionGeneratorService.evictIssueCache(issue);
        issueRepository.deleteById(id);
        updateSeriesIssueCount(seriesId);
        evictIssueCaches();
        evictSeriesRelatedCaches(seriesId);

        log.info("Deleted issue with ID: {}", id);
    }

    @Transactional
    public List<Issue> createIssuesFromComicVine(Long seriesId, List<String> comicVineIssueIds) {
        log.info("Creating {} issues from Comic Vine for series ID: {}", comicVineIssueIds.size(), seriesId);

        Optional<Series> series = seriesRepository.findById(seriesId);
        if (series.isEmpty()) {
            throw new IllegalArgumentException("Series with ID " + seriesId + " not found");
        }

        if (series.get().getComicVineId() == null) {
            throw new IllegalArgumentException("Series does not have a Comic Vine ID");
        }

        List<ComicVineService.ComicVineIssueDto> comicVineIssues = comicVineService.searchIssues(series.get());

        List<Issue> createdIssues = comicVineIssueIds.stream()
                .map(issueId -> comicVineIssues.stream()
                        .filter(issue -> issue.getId().equals(issueId))
                        .findFirst()
                        .orElse(null))
                .filter(Objects::nonNull)
                .map(issue -> createIssueFromComicVineIssue(issue, series.get()))
                .collect(Collectors.toList());

        // Update count and clear caches once at the end
        updateSeriesIssueCount(seriesId);
        evictIssueCaches();
        evictSeriesRelatedCaches(seriesId);

        log.info("Created {} issues from Comic Vine", createdIssues.size());
        return createdIssues;
    }

    @CachePut(value = "issue", key = "#issueId", condition = "#result != null")
    @Transactional
    public Issue addVariantCover(Long issueId, Issue.VariantCover variantCover) {
        log.info("Adding variant cover to issue ID: {}", issueId);

        Issue issue = issueRepository.findById(issueId)
                .orElseThrow(() -> new IllegalArgumentException("Issue with ID " + issueId + " not found"));

        issue.getVariantCovers().add(variantCover);
        Issue updatedIssue = issueRepository.save(issue);

        evictCacheValue("variant-issues", "all");
        evictCacheValue("issue-list", "all-issues-list");

        log.info("Added variant cover to issue: {} #{}", issue.getSeries().getName(), issue.getIssueNumber());
        return updatedIssue;
    }

    @CachePut(value = "issue", key = "#issueId", condition = "#result != null")
    @Transactional
    public Issue removeVariantCover(Long issueId, String variantId) {
        log.info("Removing variant cover {} from issue ID: {}", variantId, issueId);

        Issue issue = issueRepository.findById(issueId)
                .orElseThrow(() -> new IllegalArgumentException("Issue with ID " + issueId + " not found"));

        if (issue.getVariantCovers() != null) {
            issue.getVariantCovers().removeIf(variant -> variant.getId().equals(variantId));
            issue.setIsVariant(!issue.getVariantCovers().isEmpty());
        }

        Issue updatedIssue = issueRepository.save(issue);

        evictCacheValue("variant-issues", "all");
        evictCacheValue("issue-list", "all-issues-list");

        log.info("Removed variant cover from issue: {} #{}", issue.getSeries().getName(), issue.getIssueNumber());
        return updatedIssue;
    }

    public void clearAllIssueCaches() {
        log.info("Clearing all issue caches");

        Arrays.asList("issue", "issue-list", "issues-by-series", "key-issues",
                "issue-stats", "recent-issues", "issue-search",
                "comic-vine-issues-by-series", "variant-issues").forEach(cacheName -> {
            try {
                Objects.requireNonNull(cacheManager.getCache(cacheName)).clear();
                log.debug("Cleared cache: {}", cacheName);
            } catch (Exception e) {
                log.warn("Failed to clear cache {}: {}", cacheName, e.getMessage());
            }
        });
    }

    private Issue createIssueWithoutCountUpdate(IssueRequest request, Series series) {
        Issue issue = new Issue();
        mapRequestToIssue(request, issue);
        issue.setSeries(series);

        if (Objects.equals(issue.getTitle(), "")) {
            issue.setTitle(series.getName() + " #" + issue.getIssueNumber());
        }

        Optional<Issue> existingIssueOpt = issueRepository.findByUploadedImageUrl(issue.getUploadedImageUrl());

        if (existingIssueOpt.isPresent()) {
            String existingUrl = existingIssueOpt.get().getUploadedImageUrl();
            String newUrl = issue.getUploadedImageUrl();

            if (existingUrl != null && newUrl != null) {
                String[] existingImgUrl = existingUrl.split("/");
                String[] issueImgUrl = newUrl.split("/");

                if (existingImgUrl.length >= 2 && issueImgUrl.length >= 2) {
                    if (Objects.equals(
                            recognitionService.getSessionImageHash(existingImgUrl[0], existingImgUrl[1]),
                            recognitionService.getSessionImageHash(issueImgUrl[0], issueImgUrl[1]))) {
                        issue.setId(existingIssueOpt.get().getId());
                    }
                } else {
                    log.warn("Image URL format unexpected. Existing: {}, New: {}", existingUrl, newUrl);
                }
            }

            // This line seems redundant - you're setting ID twice
            issue.setId(existingIssueOpt.get().getId());
        }

        // Generate description if not provided
        if ((request.getDescription() == null || request.getDescription().trim().isEmpty()) && infernoComicsConfig.isDescriptionGeneration()) {
            try {
                DescriptionGenerated generatedDescription = descriptionGeneratorService.generateDescription(
                        series.getName(),
                        request.getIssueNumber(),
                        request.getTitle(),
                        request.getCoverDate() != null ? request.getCoverDate().toString() : null,
                        request.getDescription()
                );
                issue.setDescription(generatedDescription.getDescription());
                issue.setGeneratedDescription(generatedDescription.isGenerated());
            } catch (Exception e) {
                log.warn("Failed to generate description for issue #{}: {}", request.getIssueNumber(), e.getMessage());
                issue.setDescription("");
                issue.setGeneratedDescription(false);
            }
        }

        // Process Comic Vine ID to find GCD mapping
        List<String> gcdIds = processComicVineGcdMapping(request, issue, series);
        issue.setGcdIds(gcdIds);

        Optional<MissingIssue> missingIssueOptional = missingIssueRepository.
                findMissingIssueBySeriesIdAndComicVineId(series.getId(), issue.getComicVineId());

        if (missingIssueOptional.isPresent()) {
            MissingIssue missingIssue = missingIssueOptional.get();
            missingIssue.setResolved(true);
            missingIssueRepository.save(missingIssue);
        }

        return issueRepository.save(issue);
    }

    private List<String> processComicVineGcdMapping(IssueRequest request, Issue issue, Series series) {
        List<String> gcdIds = new ArrayList<>();

        if (request.getComicVineId() == null || request.getComicVineId().trim().isEmpty()) {
            return gcdIds;
        }

        try {
            ComicVineService.ComicVineIssueDto dto = comicVineService.getComicVineIssueById(Long.valueOf(request.getComicVineId()));

            if (dto != null && series.getGcdIds() != null) {
                List<Long> gcdSeriesIds = series.getGcdIds().stream()
                        .map(Long::parseLong)
                        .toList();

                List<GCDIssue> allGcdIssues = gcDatabaseService.findGCDIssueBySeriesIds(gcdSeriesIds);
                List<GCDIssue> matchingGcdIssues = allGcdIssues.stream()
                        .filter(gcdIssue -> Objects.equals(gcdIssue.getNumber(), issue.getIssueNumber()))
                        .toList();

                gcdIds = matchingGcdIssues.stream()
                        .map(gcdIssue -> String.valueOf(gcdIssue.getId()))
                        .toList();

                log.info("Mapped {} GCD IDs for Comic Vine ID {}", gcdIds.size(), request.getComicVineId());
            }
        } catch (Exception e) {
            log.error("Error processing Comic Vine ID {}: {}", request.getComicVineId(), e.getMessage());
        }

        return gcdIds;
    }

    private void updateSeriesIssueCount(Long seriesId) {
        try {
            int issueCount = issueRepository.countBySeriesId(seriesId);
            seriesRepository.updateIssuesOwnedCount(seriesId, issueCount);
            log.debug("Updated series {} issue count to {}", seriesId, issueCount);
        } catch (Exception e) {
            log.error("Error updating series issue count for series {}: {}", seriesId, e.getMessage());
        }
    }

    private int compareIssueNumbers(Issue issue1, Issue issue2) {
        try {
            String num1 = issue1.getIssueNumber();
            String num2 = issue2.getIssueNumber();

            if (num1 == null || num1.isEmpty()) return 1;
            if (num2 == null || num2.isEmpty()) return -1;

            Double numericPart1 = extractNumericPart(num1);
            Double numericPart2 = extractNumericPart(num2);
            int numericComparison = Double.compare(numericPart1, numericPart2);

            return numericComparison == 0 ? num1.compareToIgnoreCase(num2) : numericComparison;
        } catch (Exception e) {
            String safe1 = issue1.getIssueNumber() != null ? issue1.getIssueNumber() : "";
            String safe2 = issue2.getIssueNumber() != null ? issue2.getIssueNumber() : "";
            return safe1.compareToIgnoreCase(safe2);
        }
    }

    private Double extractNumericPart(String issueNumber) {
        try {
            String cleaned = issueNumber.trim();
            Pattern pattern = Pattern.compile("(\\d+(?:\\.\\d+)?)");
            Matcher matcher = pattern.matcher(cleaned);
            return matcher.find() ? Double.parseDouble(matcher.group(1)) : Double.MAX_VALUE;
        } catch (NumberFormatException e) {
            return Double.MAX_VALUE;
        }
    }

    private Issue createIssueFromComicVineIssue(ComicVineService.ComicVineIssueDto issueDto, Series series) {
        Issue issue = new Issue();
        issue.setIssueNumber(issueDto.getIssueNumber());
        issue.setTitle(issueDto.getName());
        issue.setDescription(issueDto.getDescription());
        issue.setImageUrl(issueDto.getImageUrl());
        issue.setComicVineId(issueDto.getId());
        issue.setSeries(series);
        issue.setIsVariant(issueDto.isVariant());

        // Handle variant covers from Comic Vine
        if (issueDto.getVariants() != null && !issueDto.getVariants().isEmpty()) {
            List<Issue.VariantCover> variants = issueDto.getVariants().stream()
                    .map(v -> new Issue.VariantCover(
                            v.getId(),
                            v.getOriginalUrl(),
                            v.getCaption(),
                            v.getImageTags()
                    ))
                    .collect(Collectors.toList());

            issue.setVariantCovers(variants);
            log.info("Added {} variant covers to issue {} #{}", variants.size(), series.getName(), issueDto.getIssueNumber());
        }

        // Parse cover date if available
        if (issueDto.getCoverDate() != null && !issueDto.getCoverDate().isEmpty()) {
            try {
                issue.setCoverDate(LocalDate.parse(issueDto.getCoverDate()));
            } catch (Exception e) {
                log.warn("Could not parse cover date: {}", issueDto.getCoverDate());
            }
        }

        return issueRepository.save(issue);
    }

    private void mapRequestToIssue(IssueRequest request, Issue issue) {
        issue.setIssueNumber(request.getIssueNumber());
        issue.setTitle(request.getTitle());
        issue.setDescription(request.getDescription());
        issue.setCoverDate(request.getCoverDate());
        issue.setImageUrl(request.getImageUrl());
        issue.setCondition(request.getCondition());
        issue.setPurchasePrice(request.getPurchasePrice());
        issue.setCurrentValue(request.getCurrentValue());
        issue.setPurchaseDate(request.getPurchaseDate());
        issue.setNotes(request.getNotes());
        issue.setComicVineId(request.getComicVineId());
        issue.setIsKeyIssue(request.getIsKeyIssue());

        if (request.getUploadedImageUrl() != null) {
            String url = request.getUploadedImageUrl();
            String imagePath;

            if (url.contains("stored_images/")) {
                imagePath = url.substring(url.indexOf("stored_images/") + "stored_images/".length());
            } else if (url.contains("/image/")) {
                imagePath = url.substring(url.indexOf("/image/") + "/image/".length());
            } else {
                imagePath = url;
            }

            issue.setUploadedImageUrl(imagePath);
        }

        // Handle variant covers if present in request
        if (request.getVariantCovers() != null && !request.getVariantCovers().isEmpty()) {
            issue.setVariantCovers(new ArrayList<>(request.getVariantCovers()));
        }
    }

    // Cache helper methods
    private void evictIssueCaches() {
        Arrays.asList(CacheConstants.CacheNames.ISSUE_LIST, "key-issues", "variant-issues", "issue-stats", "recent-issues")
                .forEach(cacheName -> {
                    try {
                        Objects.requireNonNull(cacheManager.getCache(cacheName)).clear();
                        log.debug("Evicted issue cache: {}", cacheName);
                    } catch (Exception e) {
                        log.warn("Failed to evict issue cache {}: {}", cacheName, e.getMessage());
                    }
                });
    }

    private void evictSeriesRelatedCaches(Long seriesId) {
        // Evict the specific series issues cache
        evictCacheValue(CacheConstants.CacheNames.ISSUES_BY_SERIES, seriesId.toString());

        // Evict series-related caches that depend on issue counts
        Arrays.asList(CacheConstants.CacheNames.SERIES_LIST, "series-stats", "popular-series").forEach(cacheName -> {
            try {
                Objects.requireNonNull(cacheManager.getCache(cacheName)).clear();
                log.debug("Evicted series cache due to issue change: {}", cacheName);
            } catch (Exception e) {
                log.warn("Failed to evict series cache {}: {}", cacheName, e.getMessage());
            }
        });

        // Evict the specific series from cache to refresh issue count
        evictCacheValue(CacheConstants.CacheNames.SERIES, seriesId.toString());

        // Evict the all-series-list cache to ensure getAllSeries() refreshes
        evictCacheValue(CacheConstants.CacheNames.SERIES_LIST, CacheConstants.CacheKeys.ALL_SERIES_LIST);
    }

    @SuppressWarnings("unchecked")
    private <T> T getCachedValue() {
        try {
            var cache = cacheManager.getCache(CacheConstants.CacheNames.ISSUE_LIST);
            if (cache != null) {
                var wrapper = cache.get(CacheConstants.CacheKeys.ALL_ISSUES_LIST);
                if (wrapper != null) {
                    return (T) wrapper.get();
                }
            }
        } catch (Exception e) {
            log.warn("Failed to get cached value from {} with key {}: {}", CacheConstants.CacheNames.ISSUE_LIST, CacheConstants.CacheKeys.ALL_ISSUES_LIST, e.getMessage());
        }
        return null;
    }

    private void putCacheValue(Object value) {
        try {
            var cache = cacheManager.getCache(CacheConstants.CacheNames.ISSUE_LIST);
            if (cache != null) {
                cache.put(CacheConstants.CacheKeys.ALL_ISSUES_LIST, value);
            }
        } catch (Exception e) {
            log.warn("Failed to cache value in {} with key {}: {}", CacheConstants.CacheNames.ISSUE_LIST, CacheConstants.CacheKeys.ALL_ISSUES_LIST, e.getMessage());
        }
    }

    private void evictCacheValue(String cacheName, String key) {
        try {
            var cache = cacheManager.getCache(cacheName);
            if (cache != null) {
                cache.evict(key);
                log.debug("Evicted cache entry: {} - {}", cacheName, key);
            }
        } catch (Exception e) {
            log.warn("Failed to evict cache entry {} from {}: {}", key, cacheName, e.getMessage());
        }
    }

    @Transactional
    public Issue.BulkDeleteResult deleteIssuesBulk(List<Long> issueIds) {
        log.info("Bulk deleting {} issues", issueIds.size());

        if (issueIds.isEmpty()) {
            return new Issue.BulkDeleteResult(0, 0);
        }

        // Get series ID from first issue to update count later
        Optional<Issue> firstIssue = issueRepository.findById(issueIds.getFirst());
        if (firstIssue.isEmpty()) {
            return new Issue.BulkDeleteResult(0, issueIds.size());
        }

        Long seriesId = firstIssue.get().getSeries().getId();
        int successful = 0;

        // Delete issues
        for (Long issueId : issueIds) {
            try {
                if (issueRepository.existsById(issueId)) {
                    issueRepository.deleteById(issueId);
                    successful++;
                }
            } catch (Exception e) {
                log.error("Failed to delete issue {}: {}", issueId, e.getMessage());
            }
        }

        // Update series count once at the end
        updateSeriesIssueCount(seriesId);

        // Clear caches once
        evictIssueCaches();
        evictSeriesRelatedCaches(seriesId);

        int failed = issueIds.size() - successful;
        log.info("Bulk delete completed: {} successful, {} failed", successful, failed);

        return new Issue.BulkDeleteResult(successful, failed);
    }
}