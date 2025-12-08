package com.infernokun.infernoComics.services;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class SessionCleanupService {

    private final ProgressDataService progressDataService;

    @Autowired
    public SessionCleanupService(ProgressDataService progressDataService) {
        this.progressDataService = progressDataService;
    }

    @Scheduled(fixedDelay = 30 * 60 * 1000) // 30 minutes
    public void cleanupOldSessions() {
        long maxAgeMs = 2 * 60 * 60 * 1000; // 2 hours

        int activeBefore = progressDataService.getActiveSessionCount();
        int totalBefore = progressDataService.getTotalSessionCount();

        log.debug("Starting session cleanup - Active: {}, Total: {}", activeBefore, totalBefore);

        progressDataService.cleanupOldSessions(maxAgeMs);

        int activeAfter = progressDataService.getActiveSessionCount();
        int totalAfter = progressDataService.getTotalSessionCount();

        if (totalBefore != totalAfter) {
            log.info("Session cleanup completed - Cleaned {} old sessions. Active: {}, Total: {}",
                    totalBefore - totalAfter, activeAfter, totalAfter);
        }
    }
}