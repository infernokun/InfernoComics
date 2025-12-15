package com.infernokun.infernoComics.controllers;

import com.infernokun.infernoComics.models.*;
import com.infernokun.infernoComics.models.dto.SeriesRequest;
import com.infernokun.infernoComics.models.enums.StartedBy;
import com.infernokun.infernoComics.models.enums.State;
import com.infernokun.infernoComics.models.sync.ProcessedFile;
import com.infernokun.infernoComics.models.sync.ProcessingResult;
import com.infernokun.infernoComics.repositories.sync.ProcessedFileRepository;
import com.infernokun.infernoComics.services.*;
import com.infernokun.infernoComics.services.sync.NextcloudSyncService;
import com.infernokun.infernoComics.services.sync.WeirdService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

import static com.infernokun.infernoComics.utils.InfernoComicsUtils.createEtag;

import com.infernokun.infernoComics.services.ComicVineService.ComicVineIssueDto;
import com.infernokun.infernoComics.services.ComicVineService.ComicVineSeriesDto;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/series")
public class SeriesController extends BaseController {
    private final WeirdService weirdService;
    private final SeriesService seriesService;
    private final IssueService issueService;
    private final ProgressDataService progressDataService;
    private final NextcloudSyncService syncService;
    private final RecognitionService recognitionService;
    private final ProcessedFileRepository processedFileRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<List<Series>>> getAllSeries() {
        return ResponseEntity.ok(ApiResponse.<List<Series>>builder().data(seriesService.getAllSeries()).build());
    }

    @GetMapping("/with-issues")
    public ResponseEntity<ApiResponse<List<Series.SeriesWithIssues>>> getSeriesWithIssues() {
        List<Series> series = seriesService.getAllSeries();

        List<Series.SeriesWithIssues> seriesWithIssuesList = new ArrayList<>();

        series.forEach(s -> {
            Series.SeriesWithIssues seriesWithIssues = new Series.SeriesWithIssues(s);

            List<Issue> issues = issueService.getIssuesBySeriesId(s.getId());
            seriesWithIssues.setIssues(issues);

            seriesWithIssuesList.add(seriesWithIssues);
        });

        return createSuccessResponse(seriesWithIssuesList);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Series>> getSeriesById(@PathVariable Long id) {
        return createSuccessResponse(seriesService.getSeriesById(id));
    }

    @GetMapping("/with-issues/{id}")
    public ResponseEntity<ApiResponse<Series.SeriesWithIssues>> getSeriesByIdWithIssues(@PathVariable Long id) {
       Series series = seriesService.getSeriesById(id);

       Series.SeriesWithIssues seriesWithIssues = new Series.SeriesWithIssues(series);
       List<Issue> issues = issueService.getIssuesBySeriesId(series.getId());

       seriesWithIssues.setIssues(issues);

       return createSuccessResponse(seriesWithIssues);
    }

    @GetMapping("/folder")
    public ResponseEntity<ApiResponse<List<Series.FolderMapping>>> getSeriesFolderStructure() {
        List<Series> series = seriesService.getAllSeries();
        List<Series.FolderMapping> folderMappings = series.stream()
                .map(Series::getFolderMapping)
                .collect(Collectors.toList());
        return createSuccessResponse(folderMappings);
    }

    @GetMapping("/search/advanced")
    public ResponseEntity<ApiResponse<List<Series>>> searchSeriesAdvanced(
            @RequestParam(required = false) String publisher,
            @RequestParam(required = false) Integer startYear,
            @RequestParam(required = false) Integer endYear) {

            return createSuccessResponse(seriesService.searchSeriesByPublisherAndYear(publisher, startYear, endYear));
    }

    @GetMapping("/recent")
    public ResponseEntity<ApiResponse<List<Series>>> getRecentSeries(@RequestParam(defaultValue = "10") int limit) {
        try {
            return createSuccessResponse(seriesService.getRecentSeries(limit));
        } catch (Exception e) {
            log.error("Error fetching recent series: {}", e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/popular")
    public ResponseEntity<ApiResponse<List<Series>>> getPopularSeries(@RequestParam(defaultValue = "10") int limit) {
        return createSuccessResponse(seriesService.getPopularSeries(limit));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getSeriesStats() {
        return createSuccessResponse(seriesService.getSeriesStats());
    }

    // Comic Vine integration endpoints
    @GetMapping("/search-comic-vine")
    public ResponseEntity<ApiResponse<List<ComicVineSeriesDto>>> searchComicVineSeries(@RequestParam String query) {
        return createSuccessResponse(seriesService.searchComicVineSeries(query));

    }

    @GetMapping("/{seriesId}/search-comic-vine")
    public ResponseEntity<ApiResponse<List<ComicVineIssueDto>>> searchComicVineIssues(@PathVariable Long seriesId) {
        return createSuccessResponse(seriesService.searchComicVineIssues(seriesId));
    }

    @GetMapping("/get-comic-vine/{comicVineId}")
    public ResponseEntity<ApiResponse<ComicVineSeriesDto>> getComicVineSeriesById(@PathVariable Long comicVineId) {
        return createSuccessResponse(seriesService.getComicVineSeriesById(comicVineId));
    }

    @GetMapping("/search")
    public ResponseEntity<ApiResponse<List<Series>>> searchSeries(@RequestParam String query) {
        return createSuccessResponse(seriesService.searchSeries(query));
    }

    @CrossOrigin(origins = "*", allowCredentials = "false")
    @GetMapping(value = "{seriesId}/add-comics-by-images/progress", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter getMultipleImagesProcessingProgress(
            @PathVariable Long seriesId,
            @RequestParam String sessionId) {

        log.debug("SSE connection requested for multiple images session: {} (series: {})", sessionId, seriesId);

        try {
            return progressDataService.createProgressEmitter(sessionId);
        } catch (Exception e) {
            log.error("Failed to create SSE emitter for multiple images session {}: {}", sessionId, e.getMessage());

            // Return a failed emitter
            SseEmitter errorEmitter = new SseEmitter(1000L);
            try {
                errorEmitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"error\":\"Failed to create progress stream\"}"));
                errorEmitter.complete();
            } catch (Exception sendError) {
                log.error("Failed to send error via SSE: {}", sendError.getMessage());
            }
            return errorEmitter;
        }
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Series>> createSeries(@Valid @RequestBody SeriesRequest request) {
        return createSuccessResponse(seriesService.createSeries(request));
    }

    @PostMapping("/startSync")
    public ResponseEntity<ApiResponse<List<ProcessingResult>>> startAllSeriesSync() {
        List<ProcessingResult> results = new ArrayList<>();
        seriesService.getAllSeries().forEach(series -> results.add(syncService.manualSync(series.getId())));

        return createSuccessResponse(results);
    }

    @PostMapping("/startSync/{id}")
    public ResponseEntity<ApiResponse<ProcessingResult>> startSeriesSync(@PathVariable Long id) {
        return createSuccessResponse(syncService.manualSync(id));
    }

    @PostMapping("/from-comic-vine")
    public ResponseEntity<ApiResponse<Series>> createSeriesFromComicVine(
            @RequestParam String comicVineId,
            @RequestBody ComicVineService.ComicVineSeriesDto comicVineData) {
        return createSuccessResponse(seriesService.createSeriesFromComicVine(comicVineId, comicVineData));
    }

    @PostMapping("/batch/from-comic-vine")
    public ResponseEntity<ApiResponse<List<Series>>> createMultipleSeriesFromComicVine(
            @RequestBody List<ComicVineService.ComicVineSeriesDto> comicVineSeriesList) {
        return createSuccessResponse(seriesService.createMultipleSeriesFromComicVine(comicVineSeriesList));
    }

    @PostMapping("/reverify-metadata/{seriesId}")
    public ResponseEntity<ApiResponse<Series>> reverifyMetadata(@PathVariable Long seriesId) {
        return createSuccessResponse(seriesService.reverifyMetadata(seriesId));
    }

    @PostMapping("{seriesId}/add-comics-by-images/start")
    public ResponseEntity<Map<String, String>> startImagesProcessing(
            @PathVariable Long seriesId,
            @RequestParam("images") MultipartFile[] imageFiles,
            @RequestParam(value = "name", required = false, defaultValue = "") String name,
            @RequestParam(value = "year", required = false, defaultValue = "0") Integer year) {

        try {
            // Validate images
            if (imageFiles == null || imageFiles.length == 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "No image files provided."));
            }

            // Check for empty files
            for (MultipartFile file : imageFiles) {
                if (file.isEmpty()) {
                    return ResponseEntity.badRequest().body(Map.of("error", "One or more image files are empty."));
                }
            }

            // Read all image bytes immediately before async processing
            List<ImageData> imageDataList = new ArrayList<>();
            long totalBytes = 0;
            try {
                for (MultipartFile file : imageFiles) {
                    byte[] imageBytes = file.getBytes();
                    imageDataList.add(new ImageData(
                            imageBytes,
                            file.getOriginalFilename(),
                            file.getContentType(),
                            imageBytes.length,
                            null,
                            null,
                            createEtag(imageBytes)
                    ));
                    totalBytes += imageBytes.length;
                }
            } catch (IOException e) {
                log.error("Failed to read image bytes: {}", e.getMessage());
                return ResponseEntity.badRequest().body(Map.of("error", "Failed to read image files."));
            }

            // Generate unique session ID
            String sessionId = UUID.randomUUID().toString();

            log.info("Starting image processing session {} for series {}: {} images ({} MB total)",
                    sessionId, seriesId, imageDataList.size(), totalBytes / (1024 * 1024));

            progressDataService.initializeSession(sessionId, seriesService.getSeriesById(seriesId), StartedBy.MANUAL);

            // Start async processing with image data list
            CompletableFuture<Void> start = seriesService.startMultipleImagesProcessingWithProgress(sessionId, seriesId, imageDataList, StartedBy.MANUAL, name);

            return ResponseEntity.ok(Map.of("sessionId", sessionId));

        } catch (Exception e) {
            log.error("Error starting image processing for series {}: {}", seriesId, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Error starting images processing: " + e.getMessage()));
        }
    }

    @PostMapping("/replay/{sessionId}")
    public ResponseEntity<ApiResponse<ProcessingResult>> replaySession(@PathVariable String sessionId) {
        log.info("Starting replay for session: {}", sessionId);

        // Fetch processed files for the session
        List<ProcessedFile> processedFiles = processedFileRepository.findBySessionId(sessionId);

        if (processedFiles.isEmpty()) {
            log.warn("No processed files found for session: {}", sessionId);
            return ResponseEntity.notFound().build();
        }

        Optional<ProgressData> progressDataOptional = progressDataService.getProgressDataBySessionId(sessionId);

        if (progressDataOptional.isPresent()) {
            ProgressData progressData = progressDataOptional.get();
            progressData.setState(State.REPLAYED);
            weirdService.saveProgressData(progressData);
        }

        // Extract seriesId (assuming all files in a session belong to the same series)
        Long seriesId = processedFiles.getFirst().getSeriesId();

        // Fetch the series
        Series series = seriesService.getSeriesById(seriesId);
        if (series == null) {
            log.error("Series {} not found for session {}", seriesId, sessionId);
            return ResponseEntity.ok(ApiResponse.<ProcessingResult>builder()
                    .code(HttpStatus.BAD_REQUEST.value())
                    .message("Series not found: " + seriesId)
                    .data(ProcessingResult.builder().sessionId(sessionId).build())
                    .build());
        }

        // Fetch query images from the session
        List<SeriesController.ImageData> images = recognitionService.getSessionImages(sessionId);

        if (images.isEmpty()) {
            log.warn("No query images found for session: {}", sessionId);
            return ResponseEntity.ok(ApiResponse.<ProcessingResult>builder()
                    .code(HttpStatus.BAD_REQUEST.value())
                    .message("No query images found for session")
                    .data(ProcessingResult.builder().sessionId(sessionId).build())
                    .build());
        }

        log.info("Found {} query images for session {}", images.size(), sessionId);

        processedFiles.forEach(file -> file.setProcessingStatus(ProcessedFile.ProcessingStatus.REPLAY));

        weirdService.saveProcessedFiles(processedFiles);

        sessionId = UUID.randomUUID().toString();

        progressDataService.initializeSession(sessionId, series, StartedBy.AUTOMATIC);

        // Start async processing with the query images
        recognitionService.startReplay(sessionId, seriesId, StartedBy.AUTOMATIC, images);

        return createSuccessResponse(ProcessingResult.builder().sessionId(sessionId).build(), "Successfully initiated replay for session: " + sessionId);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Series>> updateSeries(@PathVariable Long id, @Valid @RequestBody SeriesRequest request) {
        return createSuccessResponse(seriesService.updateSeries(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteSeries(@PathVariable Long id) {
        try {
            seriesService.deleteSeries(id);
            return createSuccessResponse();
        } catch (IllegalArgumentException e) {
            log.warn("Series {} not found for deletion", id);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Error deleting series {}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/cache")
    public ResponseEntity<ApiResponse<Void>> clearSeriesCaches() {
        seriesService.clearAllSeriesCaches();
        return createSuccessResponse("Successfully cleared all series caches");
    }

    @DeleteMapping("/cache/comic-vine")
    public ResponseEntity<ApiResponse<Void>> refreshComicVineCache() {
        seriesService.refreshComicVineCache();
        return createSuccessResponse("Successfully refreshed Comic Vine cache");
    }

    public record ImageData(byte[] bytes, String originalFilename, String contentType, long fileSize,
                            LocalDateTime lastModified, String filePath, String fileEtag) {
    }
}