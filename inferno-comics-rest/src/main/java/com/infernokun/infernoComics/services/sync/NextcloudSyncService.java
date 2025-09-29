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

import static com.infernokun.infernoComics.utils.InfernoComicsUtils.createEtag;

@Service
@Slf4j
@Transactional
public class NextcloudSyncService {

    private final SeriesService seriesService;
    private final NextcloudService nextcloudService;
    private final SeriesSyncStatusRepository syncStatusRepository;
    private final ProcessedFileRepository processedFileRepository;
    private final ProgressService progressService;
    private final WeirdService weirdService;

    public NextcloudSyncService(SeriesService seriesService,
                                NextcloudService nextcloudService,
                                SeriesSyncStatusRepository syncStatusRepository,
                                ProcessedFileRepository processedFileRepository,
                                ProgressService progressService, WeirdService weirdService) {
        this.seriesService = seriesService;
        this.nextcloudService = nextcloudService;
        this.syncStatusRepository = syncStatusRepository;
        this.processedFileRepository = processedFileRepository;
        this.progressService = progressService;
        this.weirdService = weirdService;
    }

    public ProcessingResult processSeries(Series series) {
        String folderPath = series.getFolderMapping().getName();
        if (folderPath == null || folderPath.trim().isEmpty()) {
            log.info("Skipping series {} - no folder mapping", series.getId());
            return ProcessingResult.noNewFiles();
        }

        log.info("Processing series {} with folder: {}", series.getId(), folderPath);

        try {
            // Get current folder state from Nextcloud
            NextcloudFolderInfo currentFolderInfo = nextcloudService.getFolderInfo(folderPath);
            List<NextcloudFile> imageFiles = nextcloudService.getImageFiles(currentFolderInfo);

            // Get or create sync status
            SeriesSyncStatus syncStatus = getOrCreateSyncStatus(series.getId(), folderPath, imageFiles);

            List<NextcloudFile> filteredImageFiles = getNewFiles(imageFiles, syncStatus);

            if (filteredImageFiles.isEmpty()) {
                log.info("Skipping series {} - filtered files is empty", series.getId());
                updateSyncStatus(syncStatus, SeriesSyncStatus.SyncStatus.EMPTY,
                        0, null);
                return ProcessingResult.noNewFiles();
            }

            log.info("Processing {} new/changed images for series {} (out of {} total)",
                    filteredImageFiles.size(), series.getId(), imageFiles.size());

            // Update status to IN_PROGRESS
            updateSyncStatus(syncStatus, SeriesSyncStatus.SyncStatus.IN_PROGRESS,
                    imageFiles.size(), null);

            return processNewFiles(series.getId(), filteredImageFiles, imageFiles.size(), syncStatus, currentFolderInfo);

        } catch (Exception e) {
            log.error("Error processing series {}: {}", series.getId(), e.getMessage());
            updateSyncStatusOnError(series.getId(), folderPath, e.getMessage());
            return ProcessingResult.error(e.getMessage());
        }
    }

    private SeriesSyncStatus getOrCreateSyncStatus(Long seriesId, String folderPath, List<NextcloudFile> imageFiles) {
        return SeriesSyncStatus.builder()
                        .seriesId(seriesId)
                        .folderPath(folderPath)
                        .totalFilesCount(imageFiles.size())
                        .syncStatus(SeriesSyncStatus.SyncStatus.PENDING)
                        .build();
    }

    /*private SeriesSyncStatus getOrCreateSyncStatus(Long seriesId, String folderPath, List<NextcloudFile> imageFiles) {
        return syncStatusRepository.findFirstBySeriesIdAndFolderPathOrderByLastSyncTimestampDesc(
                seriesId, folderPath)
                .orElse(SeriesSyncStatus.builder()
                        .seriesId(seriesId)
                        .folderPath(folderPath)
                        .totalFilesCount(imageFiles.size())
                        .syncStatus(SeriesSyncStatus.SyncStatus.PENDING)
                        .build());
    }*/

    private List<NextcloudFile> getNewFiles(List<NextcloudFile> files, SeriesSyncStatus syncStatus) {
        if (files == null || files.isEmpty() || syncStatus == null) {
            return Collections.emptyList();
        }

        LocalDateTime reference = syncStatus.getLastSyncTimestamp();

        return files.stream()
                .filter(file -> shouldProcessFile(syncStatus.getSeriesId(), file))
                .collect(Collectors.toList());
    }

    private boolean shouldProcessFolder(SeriesSyncStatus syncStatus,
                                        NextcloudFolderInfo currentFolderInfo,
                                        List<NextcloudFile> imageFiles) {

        /* First‑time processing (no ID yet). */
        if (syncStatus == null || syncStatus.getId() == null) {
            log.info("First time processing folder - will process");
            return true;
        }

        /* Image count changed. */
        if (!Objects.equals(syncStatus.getTotalFilesCount(), imageFiles.size())) {
            log.info("Image count changed: {} -> {}",
                    syncStatus.getTotalFilesCount(), imageFiles.size());
            return true;
        }
        return false;
    }

    private boolean shouldProcessFile(long seriesId, NextcloudFile file) {
        return processedFileRepository
                .findBySeriesIdAndFilePath(seriesId, file.getPath())
                .map(existingRecord -> {
                    boolean shouldReprocess = existingRecord.getProcessingStatus() != ProcessedFile.ProcessingStatus.COMPLETE;

                    if (shouldReprocess) {
                        log.info("File {} will be reprocessed due to previous failure, deleting old record", file.getPath());
                        weirdService.deleteProcessedFile(existingRecord);
                    } else {
                        log.info("File {} already processed successfully, skipping", file.getPath());
                    }

                    return shouldReprocess;
                })
                .orElseGet(() -> {
                    log.info("File {} not found in processed records, will process", file.getPath());
                    return true;
                });
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

        for (NextcloudFile file : newFiles) {
            try {
                byte[] imageBytes = nextcloudService.downloadFile(file.getPath());
                imageDataList.add(new SeriesController.ImageData(
                        imageBytes, file.getName(), file.getContentType(),
                        file.getSize(), file.getLastModified(), file.getPath(),
                        createEtag(imageBytes)
                ));

            } catch (Exception e) {
                log.error("Failed to download image {}: {}", file.getName(), e.getMessage());

                // Find existing record or create new one
                ProcessedFile processedFile = processedFileRepository
                        .findBySeriesIdAndFilePath(seriesId, file.getPath())
                        .orElse(ProcessedFile.builder()
                                .seriesId(seriesId)
                                .filePath(file.getPath())
                                .fileName(file.getName())
                                .sessionId(sessionId)
                                .build());

                // Update the record with new failure info
                processedFile.setFileEtag(file.getEtag());
                processedFile.setFileSize(file.getSize());
                processedFile.setFileLastModified(file.getLastModified());
                processedFile.setProcessingStatus(ProcessedFile.ProcessingStatus.FAILED);
                processedFile.setErrorMessage(e.getMessage());

                filesToRecord.add(processedFile);
            }
        }

        if (!filesToRecord.isEmpty()) {
            weirdService.saveProcessedFiles(filesToRecord);
        }

        // Process images if any were successfully downloaded
        if (!imageDataList.isEmpty()) {
            try {
                progressService.initializeSession(sessionId, seriesId, StartedBy.AUTOMATIC);

                seriesService.startMultipleImagesProcessingWithProgress(
                        sessionId, seriesId, imageDataList, StartedBy.AUTOMATIC, null, 0);

                log.info("Started processing {} images for series {} with session {}",
                        imageDataList.size(), seriesId, sessionId);

            } catch (Exception e) {
                log.error("Failed to start image processing for series {}: {}", seriesId, e.getMessage());

                updateSyncStatusOnError(seriesId, syncStatus.getFolderPath(), e.getMessage());
                return ProcessingResult.error(e.getMessage());
            }
        }

        updateSyncStatus(syncStatus, SeriesSyncStatus.SyncStatus.COMPLETED, totalFiles, sessionId);

        return ProcessingResult.success(totalFiles, newFiles.size(), successCount, sessionId);
    }

    private void updateSyncStatus(SeriesSyncStatus syncStatus,
                                  SeriesSyncStatus.SyncStatus status,
                                  Integer totalFiles, String sessionId) {
        syncStatus.setSyncStatus(status);
        syncStatus.setSessionId(sessionId);

        if (syncStatus.getSyncStatus() == SeriesSyncStatus.SyncStatus.COMPLETED) {
            syncStatus.setLastSyncTimestamp(LocalDateTime.now());
        }

        if (totalFiles != null) {
            syncStatus.setTotalFilesCount(totalFiles);
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

    @Scheduled(cron = "0 0 2 * * *")
    public void runSeriesProcessingScheduler() {
        List<Series> allSeries = seriesService.getAllSeries();
        allSeries.forEach(this::processSeries);
    }

    // Manual sync endpoint
    public ProcessingResult manualSync(Long seriesId) {
        Series series = seriesService.getSeriesById(seriesId);

        return processSeries(series);
    }
}