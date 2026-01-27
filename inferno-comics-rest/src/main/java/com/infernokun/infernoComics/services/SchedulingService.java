package com.infernokun.infernoComics.services;

import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.services.sync.NextcloudSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class SchedulingService {
    private final SeriesService seriesService;
    private final NextcloudSyncService nextcloudSyncService;

    /**
     * Runs daily at 2:00 AM
     * Processes all series for synchronization with Nextcloud
     */
    @Scheduled(cron = "0 0 2 * * *")
    private void runSeriesProcessingScheduler() {
        List<Series> allSeries = seriesService.getAllSeries();
        allSeries.forEach(nextcloudSyncService::processSeries);
    }

    /**
     * Runs every Wednesday at 12:00 PM
     * Re-verifies metadata for all series
     */
    @Scheduled(cron = "0 0 12 ? * WED")
    private void runReverificationScheduler() {
        List<Series> allSeries = seriesService.getAllSeries();
        allSeries.forEach(s -> seriesService.reverifyMetadata(s.getId()));
    }

    /**
     * Runs daily at 6:00 AM
     * Automates which issues are missing
     */
    @Scheduled(cron = "0 0 6 * * *")
    public void runMissingIssueScheduler() {
        List<Series> allSeries = seriesService.getAllSeries();
        allSeries.forEach(seriesService::calculateMissingIssues);
    }
}
