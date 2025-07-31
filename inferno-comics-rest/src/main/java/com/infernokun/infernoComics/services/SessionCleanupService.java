package com.infernokun.infernoComics.services;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class SessionCleanupService {

    private final ProgressService progressService;

    @Autowired
    public SessionCleanupService(ProgressService progressService) {
        this.progressService = progressService;
    }

    @Scheduled(fixedDelay = 30 * 60 * 1000) // 30 minutes
    public void cleanupOldSessions() {
        long maxAgeMs = 2 * 60 * 60 * 1000; // 2 hours

        int activeBefore = progressService.getActiveSessionCount();
        int totalBefore = progressService.getTotalSessionCount();

        log.debug("Starting session cleanup - Active: {}, Total: {}", activeBefore, totalBefore);

        progressService.cleanupOldSessions(maxAgeMs);

        int activeAfter = progressService.getActiveSessionCount();
        int totalAfter = progressService.getTotalSessionCount();

        if (totalBefore != totalAfter) {
            log.info("Session cleanup completed - Cleaned {} old sessions. Active: {}, Total: {}",
                    totalBefore - totalAfter, activeAfter, totalAfter);
        }
    }

    @Scheduled(fixedDelay = 60 * 60 * 1000) // 1 hour
    public void logSessionStatistics() {
        int activeCount = progressService.getActiveSessionCount();
        int totalCount = progressService.getTotalSessionCount();

        log.info("SSE Session Statistics - Active connections: {}, Total sessions: {}",
                activeCount, totalCount);
    }
}