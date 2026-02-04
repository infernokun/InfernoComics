package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.models.Issue;
import com.infernokun.infernoComics.models.MissingIssue;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.repositories.IssueRepository;
import com.infernokun.infernoComics.repositories.MissingIssueRepository;
import com.infernokun.infernoComics.repositories.SeriesRepository;
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

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("completedSeries", completedSeries);
        result.put("totalTrackedSeries", (long) seriesWithAvailable.size());
        result.put("averageCompletion", Math.round(avgCompletion * 10.0) / 10.0);
        result.put("topSeriesCompletion", seriesCompletion);
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
}
