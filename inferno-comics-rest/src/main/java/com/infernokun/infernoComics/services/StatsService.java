package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.models.Issue;
import com.infernokun.infernoComics.models.MissingIssue;
import com.infernokun.infernoComics.models.ProgressData;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.enums.State;
import com.infernokun.infernoComics.models.sync.ProcessedFile;
import com.infernokun.infernoComics.models.sync.SeriesSyncStatus;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.repositories.MissingIssueRepository;
import com.infernokun.infernoComics.repositories.ProgressDataRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
import com.infernokun.infernoComics.repositories.sync.ProcessedFileRepository;
import com.infernokun.infernoComics.repositories.sync.SeriesSyncStatusRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class StatsService {

    private final SeriesRepository seriesRepository;
    private final IssueRepository issueRepository;
    private final MissingIssueRepository missingIssueRepository;
    private final ProgressDataRepository progressDataRepository;
    private final ProcessedFileRepository processedFileRepository;
    private final SeriesSyncStatusRepository seriesSyncStatusRepository;

    @Cacheable(value = "collection-stats", key = "'global'")
    public Map<String, Object> getCollectionStats() {
        log.info("Calculating comprehensive collection statistics");

        List<Series> allSeries = seriesRepository.findAll();
        List<Issue> allIssues = issueRepository.findAll();
        List<MissingIssue> missingIssues = missingIssueRepository.findUnresolvedMissingIssues();

        Map<String, Object> stats = new LinkedHashMap<>();

        // Overview
        stats.put("overview", buildOverview(allSeries, allIssues, missingIssues));

        // Publisher breakdown
        stats.put("publisherBreakdown", buildPublisherBreakdown(allSeries, allIssues));

        // Decade breakdown
        stats.put("decadeBreakdown", buildDecadeBreakdown(allSeries));

        // Condition breakdown
        stats.put("conditionBreakdown", buildConditionBreakdown(allIssues));

        // Top series by issue count
        stats.put("topSeriesByIssueCount", buildTopSeriesByIssueCount(allIssues));

        // Collection growth by month
        stats.put("collectionGrowth", buildCollectionGrowth(allIssues));

        // Completion stats
        stats.put("completionStats", buildCompletionStats(allSeries));

        // Value analysis
        stats.put("valueAnalysis", buildValueAnalysis(allIssues));

        // Newest series
        stats.put("newestSeries", buildNewestSeries(allSeries));

        // Newest issues
        stats.put("newestIssues", buildNewestIssues(allIssues));

        // Read/unread breakdown
        stats.put("readStats", buildReadStats(allIssues));

        // Processing stats
        List<ProgressData> allProgressData = progressDataRepository.findAll();
        stats.put("processingStats", buildProcessingStats(allProgressData));

        // Processed file stats
        List<ProcessedFile> allProcessedFiles = processedFileRepository.findAll();
        stats.put("fileStats", buildFileStats(allProcessedFiles));

        // Sync stats
        List<SeriesSyncStatus> allSyncStatuses = seriesSyncStatusRepository.findAll();
        stats.put("syncStats", buildSyncStats(allSyncStatuses));

        return stats;
    }

    private Map<String, Object> buildOverview(List<Series> allSeries, List<Issue> allIssues, List<MissingIssue> missingIssues) {
        long totalSeries = allSeries.size();
        long totalIssues = allIssues.size();
        long keyIssues = allIssues.stream().filter(i -> Boolean.TRUE.equals(i.getIsKeyIssue())).count();
        long variantIssues = allIssues.stream().filter(i -> Boolean.TRUE.equals(i.getIsVariant())).count();
        long uniquePublishers = allSeries.stream()
                .map(Series::getPublisher)
                .filter(Objects::nonNull)
                .distinct()
                .count();
        long missingIssueCount = missingIssues.size();

        BigDecimal totalCurrentValue = allIssues.stream()
                .map(Issue::getCurrentValue)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalPurchaseValue = allIssues.stream()
                .map(Issue::getPurchasePrice)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return Map.of(
                "totalSeries", totalSeries,
                "totalIssues", totalIssues,
                "keyIssues", keyIssues,
                "variantIssues", variantIssues,
                "uniquePublishers", uniquePublishers,
                "missingIssues", missingIssueCount,
                "totalCurrentValue", totalCurrentValue,
                "totalPurchaseValue", totalPurchaseValue
        );
    }

    private List<Map<String, Object>> buildPublisherBreakdown(List<Series> allSeries, List<Issue> allIssues) {
        // Count series per publisher
        Map<String, Long> seriesPerPublisher = allSeries.stream()
                .filter(s -> s.getPublisher() != null && !s.getPublisher().isBlank())
                .collect(Collectors.groupingBy(Series::getPublisher, Collectors.counting()));

        // Count issues per publisher
        Map<String, Long> issuesPerPublisher = allIssues.stream()
                .filter(i -> i.getSeries() != null && i.getSeries().getPublisher() != null)
                .collect(Collectors.groupingBy(
                        i -> i.getSeries().getPublisher(),
                        Collectors.counting()
                ));

        long totalSeries = allSeries.size();

        return seriesPerPublisher.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(entry -> {
                    Map<String, Object> pub = new LinkedHashMap<>();
                    pub.put("name", entry.getKey());
                    pub.put("seriesCount", entry.getValue());
                    pub.put("issueCount", issuesPerPublisher.getOrDefault(entry.getKey(), 0L));
                    pub.put("percentage", totalSeries > 0
                            ? Math.round((entry.getValue() * 100.0) / totalSeries * 10.0) / 10.0
                            : 0);
                    return pub;
                })
                .collect(Collectors.toList());
    }

    private Map<String, Long> buildDecadeBreakdown(List<Series> allSeries) {
        return allSeries.stream()
                .filter(s -> s.getStartYear() != null)
                .collect(Collectors.groupingBy(
                        s -> (s.getStartYear() / 10) * 10 + "s",
                        TreeMap::new,
                        Collectors.counting()
                ));
    }

    private Map<String, Long> buildConditionBreakdown(List<Issue> allIssues) {
        return allIssues.stream()
                .filter(i -> i.getCondition() != null)
                .collect(Collectors.groupingBy(
                        i -> i.getCondition().toString(),
                        Collectors.counting()
                ));
    }

    private List<Map<String, Object>> buildTopSeriesByIssueCount(List<Issue> allIssues) {
        Map<String, Long> seriesCounts = allIssues.stream()
                .filter(i -> i.getSeries() != null)
                .collect(Collectors.groupingBy(
                        i -> i.getSeries().getName(),
                        Collectors.counting()
                ));

        return seriesCounts.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(10)
                .map(entry -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("name", entry.getKey());
                    item.put("count", entry.getValue());
                    return item;
                })
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> buildCollectionGrowth(List<Issue> allIssues) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM");

        Map<String, Long> monthCounts = allIssues.stream()
                .filter(i -> i.getCreatedAt() != null)
                .collect(Collectors.groupingBy(
                        i -> i.getCreatedAt().format(formatter),
                        TreeMap::new,
                        Collectors.counting()
                ));

        // Fill in missing months if there are gaps
        if (!monthCounts.isEmpty()) {
            String firstMonth = monthCounts.keySet().iterator().next();
            YearMonth start = YearMonth.parse(firstMonth);
            YearMonth end = YearMonth.now();

            TreeMap<String, Long> filledMonths = new TreeMap<>();
            YearMonth current = start;
            while (!current.isAfter(end)) {
                String key = current.format(formatter);
                filledMonths.put(key, monthCounts.getOrDefault(key, 0L));
                current = current.plusMonths(1);
            }
            monthCounts = filledMonths;
        }

        // Build cumulative total
        long cumulative = 0;
        List<Map<String, Object>> growth = new ArrayList<>();
        for (Map.Entry<String, Long> entry : monthCounts.entrySet()) {
            cumulative += entry.getValue();
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("month", entry.getKey());
            point.put("added", entry.getValue());
            point.put("cumulative", cumulative);
            growth.add(point);
        }

        return growth;
    }

    private Map<String, Object> buildCompletionStats(List<Series> allSeries) {
        List<Series> seriesWithAvailable = allSeries.stream()
                .filter(s -> s.getIssuesAvailableCount() > 0)
                .toList();

        long completedSeries = seriesWithAvailable.stream()
                .filter(s -> s.getIssuesOwnedCount() >= s.getIssuesAvailableCount())
                .count();

        double avgCompletion = seriesWithAvailable.stream()
                .mapToDouble(s -> Math.min(100.0, (s.getIssuesOwnedCount() * 100.0) / s.getIssuesAvailableCount()))
                .average()
                .orElse(0);

        List<Map<String, Object>> seriesCompletion = seriesWithAvailable.stream()
                .sorted((a, b) -> {
                    double pctA = (a.getIssuesOwnedCount() * 100.0) / a.getIssuesAvailableCount();
                    double pctB = (b.getIssuesOwnedCount() * 100.0) / b.getIssuesAvailableCount();
                    return Double.compare(pctB, pctA);
                })
                .limit(10)
                .map(s -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("name", s.getName());
                    item.put("owned", s.getIssuesOwnedCount());
                    item.put("available", s.getIssuesAvailableCount());
                    item.put("percentage", Math.round((s.getIssuesOwnedCount() * 100.0) / s.getIssuesAvailableCount() * 10.0) / 10.0);
                    return item;
                })
                .collect(Collectors.toList());

        // Least complete series (for "Most Incomplete" chart)
        List<Map<String, Object>> leastCompleteSeriesCompletion = seriesWithAvailable.stream()
                .filter(s -> s.getIssuesOwnedCount() < s.getIssuesAvailableCount()) // Only incomplete
                .sorted((a, b) -> {
                    double pctA = (a.getIssuesOwnedCount() * 100.0) / a.getIssuesAvailableCount();
                    double pctB = (b.getIssuesOwnedCount() * 100.0) / b.getIssuesAvailableCount();
                    return Double.compare(pctA, pctB); // Ascending (lowest first)
                })
                .limit(10)
                .map(s -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("name", s.getName());
                    item.put("owned", s.getIssuesOwnedCount());
                    item.put("available", s.getIssuesAvailableCount());
                    item.put("percentage", Math.round((s.getIssuesOwnedCount() * 100.0) / s.getIssuesAvailableCount() * 10.0) / 10.0);
                    return item;
                })
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("completedSeries", completedSeries);
        result.put("totalTrackedSeries", (long) seriesWithAvailable.size());
        result.put("averageCompletion", Math.round(avgCompletion * 10.0) / 10.0);
        result.put("topSeriesCompletion", seriesCompletion);
        result.put("leastCompleteSeriesCompletion", leastCompleteSeriesCompletion);
        return result;
    }

    private Map<String, Object> buildValueAnalysis(List<Issue> allIssues) {
        List<Issue> issuesWithValue = allIssues.stream()
                .filter(i -> i.getCurrentValue() != null && i.getCurrentValue().compareTo(BigDecimal.ZERO) > 0)
                .toList();

        BigDecimal totalCurrentValue = issuesWithValue.stream()
                .map(Issue::getCurrentValue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalPurchaseValue = allIssues.stream()
                .map(Issue::getPurchasePrice)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal avgValue = issuesWithValue.isEmpty()
                ? BigDecimal.ZERO
                : totalCurrentValue.divide(BigDecimal.valueOf(issuesWithValue.size()), 2, RoundingMode.HALF_UP);

        Optional<Issue> highestValueIssue = issuesWithValue.stream()
                .max(Comparator.comparing(Issue::getCurrentValue));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalCurrentValue", totalCurrentValue);
        result.put("totalPurchaseValue", totalPurchaseValue);
        result.put("profitLoss", totalCurrentValue.subtract(totalPurchaseValue));
        result.put("averageIssueValue", avgValue);
        result.put("issuesWithValue", (long) issuesWithValue.size());

        if (highestValueIssue.isPresent()) {
            Issue hvIssue = highestValueIssue.get();
            Map<String, Object> hvInfo = new LinkedHashMap<>();
            hvInfo.put("id", hvIssue.getId());
            hvInfo.put("issueNumber", hvIssue.getIssueNumber());
            hvInfo.put("title", hvIssue.getTitle());
            hvInfo.put("seriesName", hvIssue.getSeries() != null ? hvIssue.getSeries().getName() : "Unknown");
            hvInfo.put("currentValue", hvIssue.getCurrentValue());
            result.put("highestValueIssue", hvInfo);
        }

        return result;
    }

    private List<Map<String, Object>> buildNewestSeries(List<Series> allSeries) {
        return allSeries.stream()
                .filter(s -> s.getCreatedAt() != null)
                .sorted(Comparator.comparing(Series::getCreatedAt).reversed())
                .limit(5)
                .map(s -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", s.getId());
                    item.put("name", s.getName());
                    item.put("publisher", s.getPublisher());
                    item.put("startYear", s.getStartYear());
                    item.put("imageUrl", s.getImageUrl());
                    item.put("issuesOwnedCount", s.getIssuesOwnedCount());
                    item.put("issuesAvailableCount", s.getIssuesAvailableCount());
                    item.put("createdAt", s.getCreatedAt());
                    return item;
                })
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> buildNewestIssues(List<Issue> allIssues) {
        return allIssues.stream()
                .filter(i -> i.getCreatedAt() != null)
                .sorted(Comparator.comparing(Issue::getCreatedAt).reversed())
                .limit(8)
                .map(i -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", i.getId());
                    item.put("issueNumber", i.getIssueNumber());
                    item.put("title", i.getTitle());
                    item.put("seriesName", i.getSeries() != null ? i.getSeries().getName() : "Unknown");
                    item.put("imageUrl", i.getImageUrl());
                    item.put("condition", i.getCondition() != null ? i.getCondition().toString() : null);
                    item.put("currentValue", i.getCurrentValue());
                    item.put("createdAt", i.getCreatedAt());
                    return item;
                })
                .collect(Collectors.toList());
    }

    private Map<String, Object> buildReadStats(List<Issue> allIssues) {
        long readCount = allIssues.stream().filter(Issue::isRead).count();
        long unreadCount = allIssues.size() - readCount;
        double readPercentage = allIssues.isEmpty() ? 0
                : Math.round((readCount * 100.0) / allIssues.size() * 10.0) / 10.0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("read", readCount);
        result.put("unread", unreadCount);
        result.put("readPercentage", readPercentage);
        return result;
    }

    // ========================================
    // Processing Stats (from ProgressData)
    // ========================================

    private Map<String, Object> buildProcessingStats(List<ProgressData> allProgressData) {
        Map<String, Object> result = new LinkedHashMap<>();

        long totalSessions = allProgressData.size();
        result.put("totalSessions", totalSessions);

        // Session state distribution
        Map<String, Long> stateDistribution = allProgressData.stream()
                .filter(p -> p.getState() != null)
                .collect(Collectors.groupingBy(
                        p -> p.getState().toString(),
                        Collectors.counting()
                ));
        result.put("stateDistribution", stateDistribution);

        // Manual vs Auto sessions
        Map<String, Long> startedByDistribution = allProgressData.stream()
                .filter(p -> p.getStartedBy() != null)
                .collect(Collectors.groupingBy(
                        p -> p.getStartedBy().toString(),
                        Collectors.counting()
                ));
        result.put("startedByDistribution", startedByDistribution);

        // Completed sessions for stats
        List<ProgressData> completedSessions = allProgressData.stream()
                .filter(p -> p.getState() == State.COMPLETED && p.getTimeStarted() != null && p.getTimeFinished() != null)
                .toList();

        // Average processing duration (in seconds)
        double avgDurationSeconds = completedSessions.stream()
                .mapToLong(p -> p.getDuration().getSeconds())
                .average()
                .orElse(0);
        result.put("avgDurationSeconds", Math.round(avgDurationSeconds));

        // Format as human-readable
        long avgMinutes = (long) (avgDurationSeconds / 60);
        long avgSecs = (long) (avgDurationSeconds % 60);
        result.put("avgDurationFormatted", String.format("%02d:%02d", avgMinutes, avgSecs));

        // Success rate
        long successfulSessions = allProgressData.stream()
                .filter(p -> p.getState() == State.COMPLETED)
                .count();
        long failedSessions = allProgressData.stream()
                .filter(p -> p.getState() == State.ERROR)
                .count();
        double successRate = (successfulSessions + failedSessions) > 0
                ? Math.round((successfulSessions * 100.0) / (successfulSessions + failedSessions) * 10.0) / 10.0
                : 0;
        result.put("successRate", successRate);
        result.put("successfulSessions", successfulSessions);
        result.put("failedSessions", failedSessions);

        // Total items processed
        long totalItemsProcessed = allProgressData.stream()
                .filter(p -> p.getProcessedItems() != null)
                .mapToLong(ProgressData::getProcessedItems)
                .sum();
        result.put("totalItemsProcessed", totalItemsProcessed);

        // Average items per session
        double avgItemsPerSession = completedSessions.isEmpty() ? 0
                : completedSessions.stream()
                        .filter(p -> p.getTotalItems() != null)
                        .mapToInt(ProgressData::getTotalItems)
                        .average()
                        .orElse(0);
        result.put("avgItemsPerSession", Math.round(avgItemsPerSession));

        // Processing activity by day of week
        Map<String, Long> processingByDayOfWeek = allProgressData.stream()
                .filter(p -> p.getTimeStarted() != null)
                .collect(Collectors.groupingBy(
                        p -> p.getTimeStarted().getDayOfWeek().toString(),
                        Collectors.counting()
                ));
        result.put("processingByDayOfWeek", processingByDayOfWeek);

        // Processing activity by month
        DateTimeFormatter monthFormatter = DateTimeFormatter.ofPattern("yyyy-MM");
        Map<String, Long> processingByMonth = allProgressData.stream()
                .filter(p -> p.getTimeStarted() != null)
                .collect(Collectors.groupingBy(
                        p -> p.getTimeStarted().format(monthFormatter),
                        TreeMap::new,
                        Collectors.counting()
                ));
        result.put("processingByMonth", processingByMonth);

        // Recent sessions (last 10)
        List<Map<String, Object>> recentSessions = allProgressData.stream()
                .filter(p -> p.getTimeStarted() != null)
                .sorted(Comparator.comparing(ProgressData::getTimeStarted).reversed())
                .limit(10)
                .map(p -> {
                    Map<String, Object> session = new LinkedHashMap<>();
                    session.put("sessionId", p.getSessionId());
                    session.put("seriesName", p.getSeries() != null ? p.getSeries().getName() : "Unknown");
                    session.put("state", p.getState() != null ? p.getState().toString() : null);
                    session.put("startedBy", p.getStartedBy() != null ? p.getStartedBy().toString() : null);
                    session.put("duration", p.getFormattedDuration());
                    session.put("totalItems", p.getTotalItems());
                    session.put("processedItems", p.getProcessedItems());
                    session.put("successfulItems", p.getSuccessfulItems());
                    session.put("failedItems", p.getFailedItems());
                    session.put("timeStarted", p.getTimeStarted());
                    session.put("timeFinished", p.getTimeFinished());
                    return session;
                })
                .collect(Collectors.toList());
        result.put("recentSessions", recentSessions);

        return result;
    }

    // ========================================
    // File Stats (from ProcessedFile)
    // ========================================

    private Map<String, Object> buildFileStats(List<ProcessedFile> allProcessedFiles) {
        Map<String, Object> result = new LinkedHashMap<>();

        long totalFiles = allProcessedFiles.size();
        result.put("totalFiles", totalFiles);

        // File state distribution
        Map<String, Long> stateDistribution = allProcessedFiles.stream()
                .filter(f -> f.getState() != null)
                .collect(Collectors.groupingBy(
                        f -> f.getState().toString(),
                        Collectors.counting()
                ));
        result.put("stateDistribution", stateDistribution);

        // Calculate file size stats (only for files with sizes)
        List<ProcessedFile> filesWithSize = allProcessedFiles.stream()
                .filter(f -> f.getFileSize() != null && f.getFileSize() > 0)
                .toList();

        long totalFileSize = filesWithSize.stream()
                .mapToLong(ProcessedFile::getFileSize)
                .sum();
        result.put("totalFileSize", totalFileSize);
        result.put("totalFileSizeFormatted", formatFileSize(totalFileSize));

        double avgFileSize = filesWithSize.isEmpty() ? 0
                : filesWithSize.stream()
                        .mapToLong(ProcessedFile::getFileSize)
                        .average()
                        .orElse(0);
        result.put("avgFileSize", Math.round(avgFileSize));
        result.put("avgFileSizeFormatted", formatFileSize((long) avgFileSize));

        // Files processed per day (last 30 days)
        LocalDateTime thirtyDaysAgo = LocalDateTime.now().minusDays(30);
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");

        Map<String, Long> filesPerDay = allProcessedFiles.stream()
                .filter(f -> f.getProcessedAt() != null && f.getProcessedAt().isAfter(thirtyDaysAgo))
                .collect(Collectors.groupingBy(
                        f -> f.getProcessedAt().format(formatter),
                        TreeMap::new,
                        Collectors.counting()
                ));
        result.put("filesPerDay", filesPerDay);

        // Success/failure rate
        long successfulFiles = stateDistribution.getOrDefault("COMPLETED", 0L);
        long failedFiles = stateDistribution.getOrDefault("ERROR", 0L);
        double fileSuccessRate = (successfulFiles + failedFiles) > 0
                ? Math.round((successfulFiles * 100.0) / (successfulFiles + failedFiles) * 10.0) / 10.0
                : 0;
        result.put("fileSuccessRate", fileSuccessRate);

        // Top series by processed files
        Map<Long, Long> filesPerSeries = allProcessedFiles.stream()
                .collect(Collectors.groupingBy(
                        ProcessedFile::getSeriesId,
                        Collectors.counting()
                ));
        result.put("filesPerSeriesCount", filesPerSeries.size());

        return result;
    }

    // ========================================
    // Sync Stats (from SeriesSyncStatus)
    // ========================================

    private Map<String, Object> buildSyncStats(List<SeriesSyncStatus> allSyncStatuses) {
        Map<String, Object> result = new LinkedHashMap<>();

        long totalSyncs = allSyncStatuses.size();
        result.put("totalSyncs", totalSyncs);

        // Sync status distribution
        Map<String, Long> statusDistribution = allSyncStatuses.stream()
                .filter(s -> s.getSyncStatus() != null)
                .collect(Collectors.groupingBy(
                        s -> s.getSyncStatus().toString(),
                        Collectors.counting()
                ));
        result.put("statusDistribution", statusDistribution);

        // Total files tracked
        long totalFilesTracked = allSyncStatuses.stream()
                .filter(s -> s.getTotalFilesCount() != null)
                .mapToLong(SeriesSyncStatus::getTotalFilesCount)
                .sum();
        result.put("totalFilesTracked", totalFilesTracked);

        // Average files per sync
        double avgFilesPerSync = allSyncStatuses.isEmpty() ? 0
                : allSyncStatuses.stream()
                        .filter(s -> s.getTotalFilesCount() != null)
                        .mapToInt(SeriesSyncStatus::getTotalFilesCount)
                        .average()
                        .orElse(0);
        result.put("avgFilesPerSync", Math.round(avgFilesPerSync * 10.0) / 10.0);

        // Sync health (percentage of successful syncs)
        long completedSyncs = statusDistribution.getOrDefault("COMPLETED", 0L);
        long failedSyncs = statusDistribution.getOrDefault("FAILED", 0L);
        double syncHealthRate = (completedSyncs + failedSyncs) > 0
                ? Math.round((completedSyncs * 100.0) / (completedSyncs + failedSyncs) * 10.0) / 10.0
                : 100;
        result.put("syncHealthRate", syncHealthRate);

        // Series with active syncs
        long uniqueSeriesSynced = allSyncStatuses.stream()
                .map(SeriesSyncStatus::getSeriesId)
                .distinct()
                .count();
        result.put("uniqueSeriesSynced", uniqueSeriesSynced);

        // Recent sync activity (last 10)
        List<Map<String, Object>> recentSyncs = allSyncStatuses.stream()
                .filter(s -> s.getLastSyncTimestamp() != null)
                .sorted(Comparator.comparing(SeriesSyncStatus::getLastSyncTimestamp).reversed())
                .limit(10)
                .map(s -> {
                    Map<String, Object> sync = new LinkedHashMap<>();
                    sync.put("id", s.getId());
                    sync.put("seriesId", s.getSeriesId());
                    sync.put("folderPath", s.getFolderPath());
                    sync.put("syncStatus", s.getSyncStatus() != null ? s.getSyncStatus().toString() : null);
                    sync.put("totalFilesCount", s.getTotalFilesCount());
                    sync.put("lastSyncTimestamp", s.getLastSyncTimestamp());
                    sync.put("errorMessage", s.getErrorMessage());
                    return sync;
                })
                .collect(Collectors.toList());
        result.put("recentSyncs", recentSyncs);

        // Syncs needing attention (failed or in progress for too long)
        List<Map<String, Object>> syncsNeedingAttention = allSyncStatuses.stream()
                .filter(s -> s.getSyncStatus() == SeriesSyncStatus.SyncStatus.FAILED ||
                        (s.getSyncStatus() == SeriesSyncStatus.SyncStatus.IN_PROGRESS &&
                                s.getUpdatedAt() != null &&
                                s.getUpdatedAt().isBefore(LocalDateTime.now().minusHours(1))))
                .map(s -> {
                    Map<String, Object> sync = new LinkedHashMap<>();
                    sync.put("id", s.getId());
                    sync.put("seriesId", s.getSeriesId());
                    sync.put("syncStatus", s.getSyncStatus() != null ? s.getSyncStatus().toString() : null);
                    sync.put("errorMessage", s.getErrorMessage());
                    sync.put("updatedAt", s.getUpdatedAt());
                    return sync;
                })
                .collect(Collectors.toList());
        result.put("syncsNeedingAttention", syncsNeedingAttention);
        result.put("syncsNeedingAttentionCount", syncsNeedingAttention.size());

        return result;
    }

    // Helper method to format file sizes
    private String formatFileSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        String pre = "KMGTPE".charAt(exp - 1) + "";
        return String.format("%.1f %sB", bytes / Math.pow(1024, exp), pre);
    }
}
