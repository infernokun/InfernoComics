package com.infernokun.infernoComics.services.sync;

import com.infernokun.infernoComics.controllers.SeriesController;
import com.infernokun.infernoComics.models.Series;
import com.infernokun.infernoComics.models.StartedBy;
import com.infernokun.infernoComics.models.sync.*;
import com.infernokun.infernoComics.repositories.sync.ProcessedFileRepository;
import com.infernokun.infernoComics.repositories.sync.SeriesSyncStatusRepository;
import com.infernokun.infernoComics.services.ProgressService;
import com.infernokun.infernoComics.services.SeriesService;
import jakarta.transaction.Transactional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@Transactional
public class SeriesNextcloudSyncService {

    private final SeriesService seriesService;
    private final NextcloudService nextcloudService;
    private final SeriesSyncStatusRepository syncStatusRepository;
    private final ProcessedFileRepository processedFileRepository;
    private final ProgressService progressService;

    public SeriesNextcloudSyncService(SeriesService seriesService,
                                      NextcloudService nextcloudService,
                                      SeriesSyncStatusRepository syncStatusRepository,
                                      ProcessedFileRepository processedFileRepository,
                                      ProgressService progressService) {
        this.seriesService = seriesService;
        this.nextcloudService = nextcloudService;
        this.syncStatusRepository = syncStatusRepository;
        this.processedFileRepository = processedFileRepository;
        this.progressService = progressService;
    }

    /*@Scheduled(fixedDelay = 300000) // Every 5 minutes
    public void syncAllSeries() {
        log.info("Starting scheduled Nextcloud sync for all series");

        List<Series> allSeries = seriesService.getAllSeriesWithFolderMapping();
        int processedCount = 0;
        int skippedCount = 0;
        int errorCount = 0;

        for (Series series : allSeries) {
            try {
                ProcessingResult result = processSeries(series);
                if (result.isHasNewFiles()) {
                    processedCount++;
                } else {
                    skippedCount++;
                }
            } catch (Exception e) {
                log.error("Failed to process series {}: {}", series.getId(), e.getMessage(), e);
                errorCount++;
            }
        }

        log.info("Sync completed: {} processed, {} skipped, {} errors",
                processedCount, skippedCount, errorCount);
    }*/

    public ProcessingResult processSeries(Series series) {
        String folderPath = series.getFolderMapping().getName();
        if (folderPath == null || folderPath.trim().isEmpty()) {
            log.debug("Skipping series {} - no folder mapping", series.getId());
            return ProcessingResult.noNewFiles();
        }

        log.debug("Processing series {} with folder: {}", series.getId(), folderPath);

        try {
            // Get current folder state from Nextcloud
            NextcloudFolderInfo currentFolderInfo = nextcloudService.getFolderInfo(folderPath);
            List<NextcloudFile> imageFiles = nextcloudService.getImageFiles(currentFolderInfo);

            // Get or create sync status
            SeriesSyncStatus syncStatus = getOrCreateSyncStatus(series.getId(), folderPath);

            // Check if processing is needed
            if (!shouldProcessFolder(syncStatus, currentFolderInfo, imageFiles.size())) {
                log.debug("Skipping series {} - no changes detected", series.getId());
                return ProcessingResult.noNewFiles();
            }

            // Update status to IN_PROGRESS
            /*updateSyncStatus(syncStatus, SeriesSyncStatus.SyncStatus.IN_PROGRESS,
                    imageFiles.size(), null, null);*/

            // Process images incrementally
            return processImagesFromFolder(series.getId(), imageFiles, syncStatus, currentFolderInfo);

        } catch (Exception e) {
            log.error("Error processing series {}: {}", series.getId(), e.getMessage(), e);
            updateSyncStatusOnError(series.getId(), folderPath, e.getMessage());
            return ProcessingResult.error(e.getMessage());
        }
    }

    private SeriesSyncStatus getOrCreateSyncStatus(Long seriesId, String folderPath) {
        return syncStatusRepository.findFirstBySeriesIdAndFolderPathAndUpdatedAtAfterOrderByUpdatedAtDesc(
                seriesId, folderPath, LocalDateTime.now().minusHours(23))
                .orElse(SeriesSyncStatus.builder()
                        .seriesId(seriesId)
                        .folderPath(folderPath)
                        .syncStatus(SeriesSyncStatus.SyncStatus.PENDING)
                        .build());
    }

    private boolean shouldProcessFolder(SeriesSyncStatus syncStatus,
                                        NextcloudFolderInfo currentFolderInfo,
                                        int currentImageCount) {

        // First time processing
        if (syncStatus.getId() == null) {
            log.debug("First time processing folder - will process");
            return true;
        }

        // Check if folder etag changed (folder was modified)
        if (!Objects.equals(syncStatus.getLastFolderEtag(), currentFolderInfo.getEtag())) {
            log.debug("Folder etag changed: {} -> {}",
                    syncStatus.getLastFolderEtag(), currentFolderInfo.getEtag());
            return true;
        }

        // Check if image count changed
        if (!Objects.equals(syncStatus.getTotalFilesCount(), currentImageCount)) {
            log.debug("Image count changed: {} -> {}",
                    syncStatus.getTotalFilesCount(), currentImageCount);
            return true;
        }

        return false;
    }

    private ProcessingResult processImagesFromFolder(Long seriesId,
                                                     List<NextcloudFile> imageFiles,
                                                     SeriesSyncStatus syncStatus,
                                                     NextcloudFolderInfo folderInfo) {

        if (imageFiles.isEmpty()) {
            log.info("No images found in folder for series {}", seriesId);
            updateSyncStatus(syncStatus, SeriesSyncStatus.SyncStatus.COMPLETED,
                    0, 0, folderInfo.getEtag());
            return ProcessingResult.noNewFiles();
        }

        // Get already processed files
        Set<String> processedFilePaths = processedFileRepository
                .findProcessedFilePathsBySeriesId(seriesId);

        // Filter to only new/changed files
        List<NextcloudFile> newOrChangedFiles = imageFiles.stream()
                .filter(file -> shouldProcessFile(seriesId, file, processedFilePaths))
                .collect(Collectors.toList());

        if (newOrChangedFiles.isEmpty()) {
            log.info("No new or changed files for series {}", seriesId);
            updateSyncStatus(syncStatus, SeriesSyncStatus.SyncStatus.COMPLETED,
                    imageFiles.size(), imageFiles.size(), folderInfo.getEtag());
            return ProcessingResult.noNewFiles();
        }

        log.info("Processing {} new/changed images for series {} (out of {} total)",
                newOrChangedFiles.size(), seriesId, imageFiles.size());

        // Process the new files
        return processNewFiles(seriesId, newOrChangedFiles, imageFiles.size(), syncStatus, folderInfo);
    }

    private boolean shouldProcessFile(Long seriesId, NextcloudFile file, Set<String> processedPaths) {
        String filePath = file.getPath();

        // If file wasn't processed before, process it
        if (!processedPaths.contains(filePath)) {
            return true;
        }

        // Check if file was modified since last processing
        Optional<ProcessedFile> existingRecord = processedFileRepository
                .findBySeriesIdAndFilePath(seriesId, filePath);

        if (existingRecord.isPresent()) {
            ProcessedFile processed = existingRecord.get();

            // Compare etag, size, or last modified date
            return !Objects.equals(processed.getFileEtag(), file.getEtag()) ||
                    !Objects.equals(processed.getFileSize(), file.getSize()) ||
                    (processed.getFileLastModified() != null && file.getLastModified() != null &&
                            processed.getFileLastModified().isBefore(file.getLastModified()));
        }

        return true; // Process if we can't determine
    }

    private ProcessingResult processNewFiles(Long seriesId,
                                             List<NextcloudFile> newFiles,
                                             int totalFiles,
                                             SeriesSyncStatus syncStatus,
                                             NextcloudFolderInfo folderInfo) {

        List<SeriesController.ImageData> imageDataList = new ArrayList<>();
        List<ProcessedFile> filesToRecord = new ArrayList<>();
        String sessionId = UUID.randomUUID().toString();

        int successCount = 0;
        int failCount = 0;

        for (NextcloudFile file : newFiles) {
            try {
                byte[] imageBytes = nextcloudService.downloadFile(file.getPath());
                imageDataList.add(new SeriesController.ImageData(
                        imageBytes, file.getName(), file.getContentType()
                ));

                // Prepare record for successful processing
                filesToRecord.add(ProcessedFile.builder()
                        .seriesId(seriesId)
                        .filePath(file.getPath())
                        .fileName(file.getName())
                        .fileEtag(file.getEtag())
                        .fileSize(file.getSize())
                        .fileLastModified(file.getLastModified())
                        .processingStatus(ProcessedFile.ProcessingStatus.PROCESSED)
                        .sessionId(sessionId)
                        .build());

                successCount++;

            } catch (Exception e) {
                log.error("Failed to download image {}: {}", file.getName(), e.getMessage());

                // Record failed attempt
                filesToRecord.add(ProcessedFile.builder()
                        .seriesId(seriesId)
                        .filePath(file.getPath())
                        .fileName(file.getName())
                        .fileEtag(file.getEtag())
                        .fileSize(file.getSize())
                        .fileLastModified(file.getLastModified())
                        .processingStatus(ProcessedFile.ProcessingStatus.FAILED)
                        .sessionId(sessionId)
                        .errorMessage(e.getMessage())
                        .build());

                failCount++;
            }
        }

        // Process images if any were successfully downloaded
        if (!imageDataList.isEmpty()) {
            try {
                progressService.initializeSession(sessionId, seriesId);

                seriesService.startMultipleImagesProcessingWithProgress(
                        sessionId, seriesId, imageDataList, StartedBy.AUTOMATIC, null, 0);

                log.info("Started processing {} images for series {} with session {}",
                        imageDataList.size(), seriesId, sessionId);

            } catch (Exception e) {
                log.error("Failed to start image processing for series {}: {}", seriesId, e.getMessage());

                // Mark all files as failed if processing couldn't start
                filesToRecord.forEach(file -> {
                    if (file.getProcessingStatus() == ProcessedFile.ProcessingStatus.PROCESSED) {
                        file.setProcessingStatus(ProcessedFile.ProcessingStatus.FAILED);
                        file.setErrorMessage("Failed to start processing: " + e.getMessage());
                    }
                });

                updateSyncStatusOnError(seriesId, syncStatus.getFolderPath(), e.getMessage());
                return ProcessingResult.error(e.getMessage());
            }
        }

        // Save all processed file records
        try {
            processedFileRepository.saveAll(filesToRecord);
        } catch (Exception e) {
            log.error("Failed to save processed file records: {}", e.getMessage());
        }

        // Update sync status
        Long currentProcessedCount = processedFileRepository.countProcessedFilesBySeriesId(seriesId);
        updateSyncStatus(syncStatus, SeriesSyncStatus.SyncStatus.COMPLETED,
                totalFiles, currentProcessedCount.intValue(), folderInfo.getEtag());

        return ProcessingResult.success(totalFiles, newFiles.size(), successCount, sessionId);
    }

    private void updateSyncStatus(SeriesSyncStatus syncStatus,
                                  SeriesSyncStatus.SyncStatus status,
                                  Integer totalFiles,
                                  Integer processedFiles,
                                  String folderEtag) {
        syncStatus.setSyncStatus(status);
        syncStatus.setLastSyncTimestamp(LocalDateTime.now());

        if (totalFiles != null) {
            syncStatus.setTotalFilesCount(totalFiles);
        }
        if (processedFiles != null) {
            syncStatus.setProcessedFilesCount(processedFiles);
        }
        if (folderEtag != null) {
            syncStatus.setLastFolderEtag(folderEtag);
        }

        syncStatus.setErrorMessage(null); // Clear any previous error
        syncStatusRepository.save(syncStatus);
    }

    private void updateSyncStatusOnError(Long seriesId, String folderPath, String errorMessage) {
        Optional<SeriesSyncStatus> syncStatusOpt =
                syncStatusRepository.findTopBySeriesIdAndFolderPathOrderByUpdatedAtDesc(seriesId, folderPath);

        if (syncStatusOpt.isPresent()) {
            SeriesSyncStatus syncStatus = syncStatusOpt.get();
            syncStatus.setSyncStatus(SeriesSyncStatus.SyncStatus.FAILED);
            syncStatus.setErrorMessage(errorMessage);
            syncStatusRepository.save(syncStatus);
        }
    }

    // Manual sync endpoint
    public ProcessingResult manualSync(Long seriesId) {
        Series series = seriesService.getSeriesById(seriesId);

        return processSeries(series);
    }

    // Cleanup old processed file records (optional maintenance)
    @Scheduled(cron = "0 0 2 * * SUN") // Every Sunday at 2 AM
    public void cleanupOldRecords() {
        LocalDateTime cutoffDate = LocalDateTime.now().minusMonths(3);
        List<ProcessedFile> oldRecords = processedFileRepository.findOldProcessedFiles(cutoffDate);

        if (!oldRecords.isEmpty()) {
            processedFileRepository.deleteAll(oldRecords);
            log.info("Cleaned up {} old processed file records", oldRecords.size());
        }
    }
}