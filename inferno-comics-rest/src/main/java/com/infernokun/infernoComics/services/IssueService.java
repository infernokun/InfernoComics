package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.models.DescriptionGenerated;
import com.infernokun.infernoComics.models.Issue;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.gcd.GCDIssue;
import com.infernokun.infernoComics.models.gcd.GCDSeries;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.services.gcd.GCDatabaseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional
public class IssueService {

    private final IssueRepository issueRepository;
    private final SeriesRepository seriesRepository;
    private final ComicVineService comicVineService;
    private final DescriptionGeneratorService descriptionGeneratorService;
    private final GCDatabaseService gcDatabaseService;

    public IssueService(IssueRepository issueRepository,
                        SeriesRepository seriesRepository,
                        ComicVineService comicVineService,
                        DescriptionGeneratorService descriptionGeneratorService, GCDatabaseService gcDatabaseService) {
        this.issueRepository = issueRepository;
        this.seriesRepository = seriesRepository;
        this.comicVineService = comicVineService;
        this.descriptionGeneratorService = descriptionGeneratorService;
        this.gcDatabaseService = gcDatabaseService;
    }

    // Cache all issues with TTL
    @Cacheable(value = "all-issues")
    public List<Issue> getAllIssues() {
        log.info("Fetching all issues from database");
        return issueRepository.findAll();
    }

    // Cache individual issue
    @Cacheable(value = "issue", key = "#id")
    public Optional<Issue> getIssueById(Long id) {
        log.info("Fetching issue with ID: {}", id);
        return issueRepository.findById(id);
    }

    // Cache issues by series
    @Cacheable(value = "issues-by-series", key = "#seriesId")
    public List<Issue> getIssuesBySeriesId(Long seriesId) {
        log.info("Fetching issues for series ID: {}", seriesId);

        try {
            List<Issue> issues = issueRepository.findBySeriesIdOrderByIssueNumberAsc(seriesId);

            // Sort the list with custom comparator
            issues.sort((issue1, issue2) -> {
                try {
                    String num1 = issue1.getIssueNumber();
                    String num2 = issue2.getIssueNumber();

                    // Handle null or empty issue numbers
                    if (num1 == null || num1.isEmpty()) return 1;
                    if (num2 == null || num2.isEmpty()) return -1;

                    // Extract numeric part for comparison
                    Double numericPart1 = extractNumericPart(num1);
                    Double numericPart2 = extractNumericPart(num2);

                    int numericComparison = Double.compare(numericPart1, numericPart2);

                    // If numeric parts are equal, compare the full strings
                    if (numericComparison == 0) {
                        return num1.compareToIgnoreCase(num2);
                    }

                    return numericComparison;
                } catch (Exception e) {
                    // Fallback to string comparison if parsing fails
                    String safe1 = issue1.getIssueNumber() != null ? issue1.getIssueNumber() : "";
                    String safe2 = issue2.getIssueNumber() != null ? issue2.getIssueNumber() : "";
                    return safe1.compareToIgnoreCase(safe2);
                }
            });

            return issues;

        } catch (Exception e) {
            log.error("Error fetching issues for series ID {}: {}", seriesId, e.getMessage(), e);
            return new ArrayList<>(); // Return empty list instead of null
        }
    }

    public ComicVineService.ComicVineIssueDto getComicVineIssueById(Long comicVineId) {
        return comicVineService.getIssueById(comicVineId);
    }

    private Double extractNumericPart(String issueNumber) {
        try {
            // Remove leading/trailing whitespace
            String cleaned = issueNumber.trim();

            // Use regex to find the first decimal number in the string
            Pattern pattern = Pattern.compile("(\\d+(?:\\.\\d+)?)");
            Matcher matcher = pattern.matcher(cleaned);

            if (matcher.find()) {
                return Double.parseDouble(matcher.group(1));
            }

            // If no numeric part found, return a high value to sort to end
            return Double.MAX_VALUE;

        } catch (NumberFormatException e) {
            // If parsing fails, return a high value to sort to end
            return Double.MAX_VALUE;
        }
    }

    // Cache key issues
    @Cacheable(value = "key-issues")
    public List<Issue> getKeyIssues() {
        log.info("Fetching key issues");
        return issueRepository.findKeyIssues();
    }

    // Cache Comic Vine issues search
    @Cacheable(value = "comic-vine-issues-by-series", key = "#seriesId")
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

    // Get issues with variant covers
    @Cacheable(value = "variant-issues")
    public List<Issue> getVariantIssues() {
        log.info("Fetching issues with variant covers");
        return issueRepository.findAll().stream()
                .filter(Issue::getIsVariant)
                .collect(Collectors.toList());
    }

    // Create issue and invalidate relevant caches
    @CacheEvict(value = {"all-issues", "issues-by-series", "key-issues"}, allEntries = true)
    @Transactional
    public Issue createIssue(IssueCreateRequest request) {
        log.info("Creating issue: {} #{}", request.getSeriesId(), request.getIssueNumber());

        // Validate series exists
        Optional<Series> series = seriesRepository.findById(request.getSeriesId());
        if (series.isEmpty()) {
            throw new IllegalArgumentException("Series with ID " + request.getSeriesId() + " not found");
        }

        Issue issue = new Issue();
        mapRequestToIssue(request, issue);
        issue.setSeries(series.get());

        // Generate description if not provided
        if (request.getDescription() == null || request.getDescription().trim().isEmpty()) {
            try {
                DescriptionGenerated generatedDescription = descriptionGeneratorService.generateDescription(
                        series.get().getName(),
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
        List<String> gcdIds = new ArrayList<>();
        if (request.getComicVineId() != null && !request.getComicVineId().trim().isEmpty()) {
            log.info(" Processing Comic Vine ID: {}", request.getComicVineId());
            try {
                ComicVineService.ComicVineIssueDto dto = comicVineService.getIssueById(Long.valueOf(request.getComicVineId()));
                log.info(" Comic Vine API response: dto={}", dto != null ? "found" : "null");

                if (dto != null && series.get().getGcdIds() != null) {
                    log.info(" Series has {} GCD IDs: {}", series.get().getGcdIds().size(), series.get().getGcdIds());

                    List<Long> gcdSeriesIds = series.get().getGcdIds().stream()
                            .map(Long::parseLong)
                            .toList();
                    log.info(" Converted GCD series IDs: {}", gcdSeriesIds);

                    List<GCDIssue> allGcdIssues = gcDatabaseService.findGCDIssueBySeriesIds(gcdSeriesIds);
                    log.info(" Found {} total GCD issues for series IDs", allGcdIssues.size());

                    List<GCDIssue> matchingGcdIssues = allGcdIssues.stream()
                            .filter(gcdIssue -> Objects.equals(gcdIssue.getNumber(), issue.getIssueNumber()))
                            .toList();
                    log.info("✅ Found {} matching GCD issues after filtering", matchingGcdIssues.size());

                    gcdIds = matchingGcdIssues.stream()
                            .map(gcdIssue -> String.valueOf(gcdIssue.getId()))
                            .toList();
                    log.info(" Final GCD IDs: {}", gcdIds);
                } else {
                    if (dto == null) {
                        log.error("❌ Comic Vine DTO is null");
                    }
                    if (series.get().getGcdIds() == null) {
                        log.warn("❌ Series has no GCD IDs");
                    }
                }
            } catch (Exception e) {
                log.error(" Error processing Comic Vine ID {}: {}", request.getComicVineId(), e.getMessage(), e);
            }
        } else {
            log.error("⏭️ Skipping Comic Vine processing - ID is null or empty");
        }

        issue.setGcdIds(gcdIds);
        Issue savedIssue = issueRepository.save(issue);

        log.info("Created issue with ID: {} (mapped {} GCD IDs)", savedIssue.getId(), gcdIds.size());
        return savedIssue;
    }

    // Update issue and refresh cache
    @CachePut(value = "issue", key = "#id")
    @CacheEvict(value = {"all-issues", "issues-by-series", "key-issues"}, allEntries = true)
    public Issue updateIssue(Long id, IssueUpdateRequest request) {
        log.info("Updating issue with ID: {}", id);

        Optional<Issue> optionalIssue = issueRepository.findById(id);
        if (optionalIssue.isEmpty()) {
            throw new IllegalArgumentException("Issue with ID " + id + " not found");
        }

        Issue issue = optionalIssue.get();
        Issue originalIssue = new Issue(); // For cache eviction
        copyIssue(issue, originalIssue);

        mapRequestToIssue(request, issue);

        Issue updatedIssue = issueRepository.save(issue);

        // Evict description cache if issue details changed
        descriptionGeneratorService.evictIssueCache(updatedIssue);

        log.info("Updated issue: {} #{}", issue.getSeries().getName(), issue.getIssueNumber());
        return updatedIssue;
    }

    // Delete issue and invalidate caches
    @CacheEvict(value = {"issue", "all-issues", "issues-by-series", "key-issues"}, allEntries = true)
    public void deleteIssue(Long id) {
        log.info("Deleting issue with ID: {}", id);

        if (!issueRepository.existsById(id)) {
            throw new IllegalArgumentException("Issue with ID " + id + " not found");
        }

        // Get issue for cache eviction before deletion
        Optional<Issue> issue = issueRepository.findById(id);
        issue.ifPresent(descriptionGeneratorService::evictIssueCache);

        issueRepository.deleteById(id);
        log.info("Deleted issue with ID: {}", id);
    }

    // Cache issue statistics
    @Cacheable(value = "issue-stats")
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

    // Cache recent issues
    @Cacheable(value = "recent-issues", key = "#limit")
    public List<Issue> getRecentIssues(int limit) {
        log.info("Fetching {} recent issues", limit);
        return issueRepository.findAll().stream()
                .sorted((c1, c2) -> c2.getCreatedAt().compareTo(c1.getCreatedAt()))
                .limit(limit)
                .collect(Collectors.toList());
    }

    // Search issues with caching
    @Cacheable(value = "issue-search", key = "#query + ':' + #limit")
    public List<Issue> searchIssues(String query, int limit) {
        log.info("Searching issues with query: {} (limit: {})", query, limit);

        String lowerQuery = query.toLowerCase();
        return issueRepository.findAll().stream()
                .filter(issue ->
                        issue.getTitle() != null && issue.getTitle().toLowerCase().contains(lowerQuery) ||
                                issue.getSeries().getName().toLowerCase().contains(lowerQuery) ||
                                issue.getIssueNumber().toLowerCase().contains(lowerQuery)
                )
                .limit(limit)
                .collect(Collectors.toList());
    }

    // Batch operations with cache management
    @CacheEvict(value = {"all-issues", "issues-by-series", "key-issues", "issue-stats"}, allEntries = true)
    public List<Issue> createIssuesFromComicVine(Long seriesId, List<String> comicVineIssueIds) {
        log.info("Creating issues from Comic Vine for series ID: {}", seriesId);

        Optional<Series> series = seriesRepository.findById(seriesId);
        if (series.isEmpty()) {
            throw new IllegalArgumentException("Series with ID " + seriesId + " not found");
        }

        if (series.get().getComicVineId() == null) {
            throw new IllegalArgumentException("Series does not have a Comic Vine ID");
        }

        List<ComicVineService.ComicVineIssueDto> comicVineIssues = comicVineService.searchIssues(series.get());

        return comicVineIssueIds.stream()
                .map(issueId -> comicVineIssues.stream()
                        .filter(issue -> issue.getId().equals(issueId))
                        .findFirst()
                        .orElse(null))
                .filter(Objects::nonNull)
                .map(issue -> createIssueFromComicVineIssue(issue, series.get()))
                .collect(Collectors.toList());
    }

    // Add variant cover to existing issue
    @CachePut(value = "issue", key = "#issueId")
    @CacheEvict(value = {"all-issues", "issues-by-series", "issues-with-variants"}, allEntries = true)
    public Issue addVariantCover(Long issueId, Issue.VariantCover variantCover) {
        log.info("Adding variant cover to issue ID: {}", issueId);

        Optional<Issue> optionalIssue = issueRepository.findById(issueId);
        if (optionalIssue.isEmpty()) {
            throw new IllegalArgumentException("Issue with ID " + issueId + " not found");
        }

        Issue issue = optionalIssue.get();
        issue.getVariantCovers().add(variantCover);

        Issue updatedIssue = issueRepository.save(issue);
        log.info("Added variant cover to issue: {} #{}", issue.getSeries().getName(), issue.getIssueNumber());
        return updatedIssue;
    }

    // Remove variant cover from issue
    @CachePut(value = "issue", key = "#issueId")
    @CacheEvict(value = {"all-issues", "issues-by-series", "issues-with-variants"}, allEntries = true)
    public Issue removeVariantCover(Long issueId, String variantId) {
        log.info("Removing variant cover {} from issue ID: {}", variantId, issueId);

        Optional<Issue> optionalIssue = issueRepository.findById(issueId);
        if (optionalIssue.isEmpty()) {
            throw new IllegalArgumentException("Issue with ID " + issueId + " not found");
        }

        Issue issue = optionalIssue.get();
        if (issue.getVariantCovers() != null) {
            issue.getVariantCovers().removeIf(variant -> variant.getId().equals(variantId));
            issue.setIsVariant(!issue.getVariantCovers().isEmpty());
        }

        Issue updatedIssue = issueRepository.save(issue);
        log.info("Removed variant cover from issue: {} #{}", issue.getSeries().getName(), issue.getIssueNumber());
        return updatedIssue;
    }

    // Clear all issue related caches
    @CacheEvict(value = {"issue", "all-issues", "issues-by-series", "key-issues",
            "issue-stats", "recent-issues", "issue-search",
            "comic-vine-issues-by-series", "issues-with-variants"}, allEntries = true)
    public void clearAllIssueCaches() {
        log.info("Cleared all issue caches");
    }

    // Private helper methods
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

        String fullUrl = request.getUploadedImageUrl();

        if (fullUrl != null && !fullUrl.isEmpty() && !fullUrl.equals("null")) {
            String imagePath = fullUrl.substring(fullUrl.lastIndexOf("/image/") + "/image/".length());
            issue.setUploadedImageUrl(imagePath);
        } else {
            issue.setUploadedImageUrl(null);
        }


        // Handle variant covers if present in request
        if (request instanceof IssueRequestWithVariants) {
            IssueRequestWithVariants variantRequest = (IssueRequestWithVariants) request;
            if (variantRequest.getVariantCovers() != null && !variantRequest.getVariantCovers().isEmpty()) {
                issue.setVariantCovers(new ArrayList<>(variantRequest.getVariantCovers()));
            }
        }
    }

    private void copyIssue(Issue source, Issue target) {
        target.setId(source.getId());
        target.setIssueNumber(source.getIssueNumber());
        target.setTitle(source.getTitle());
        target.setDescription(source.getDescription());
        target.setCoverDate(source.getCoverDate());
        target.setImageUrl(source.getImageUrl());
        target.setCondition(source.getCondition());
        target.setPurchasePrice(source.getPurchasePrice());
        target.setCurrentValue(source.getCurrentValue());
        target.setPurchaseDate(source.getPurchaseDate());
        target.setNotes(source.getNotes());
        target.setComicVineId(source.getComicVineId());
        target.setIsKeyIssue(source.getIsKeyIssue());
        target.setSeries(source.getSeries());
        target.setVariantCovers(source.getVariantCovers() != null ? new ArrayList<>(source.getVariantCovers()) : null);
        target.setIsVariant(source.getIsVariant());
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
                issue.setCoverDate(java.time.LocalDate.parse(issueDto.getCoverDate()));
            } catch (Exception e) {
                log.warn("Could not parse cover date: {}", issueDto.getCoverDate());
            }
        }

        return issueRepository.save(issue);
    }

    // Base request interface
    public interface IssueRequest {
        String getIssueNumber();
        String getTitle();
        String getDescription();
        java.time.LocalDate getCoverDate();
        String getImageUrl();
        Issue.Condition getCondition();
        java.math.BigDecimal getPurchasePrice();
        java.math.BigDecimal getCurrentValue();
        java.time.LocalDate getPurchaseDate();
        String getNotes();
        String getComicVineId();
        Boolean getIsKeyIssue();
        String getUploadedImageUrl();
    }

    // Extended request interface for variant covers
    public interface IssueRequestWithVariants extends IssueRequest {
        List<Issue.VariantCover> getVariantCovers();
    }

    // Create request with series ID
    public interface IssueCreateRequest extends IssueRequest {
        Long getSeriesId();
    }

    // Update request without series ID (series cannot be changed)
    public interface IssueUpdateRequest extends IssueRequest {
    }

    // Create request with variants
    public interface IssueCreateRequestWithVariants extends IssueCreateRequest, IssueRequestWithVariants {
    }

    // Update request with variants
    public interface IssueUpdateRequestWithVariants extends IssueUpdateRequest, IssueRequestWithVariants {
    }
}